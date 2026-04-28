#include "addon.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#ifdef _WIN32
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")
#else
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#endif

namespace {

#ifdef _WIN32
using SocketHandle = SOCKET;
constexpr SocketHandle kInvalidSocket = INVALID_SOCKET;

void CloseSocket(SocketHandle fd) { closesocket(fd); }
#else
using SocketHandle = int;
constexpr SocketHandle kInvalidSocket = -1;

void CloseSocket(SocketHandle fd) { close(fd); }
#endif

bool ResolveIPv4(const std::string &host, int port, sockaddr_in *addrOut) {
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_DGRAM;

  addrinfo *result = nullptr;
  const std::string portStr = std::to_string(port);
  const int status =
      getaddrinfo(host.c_str(), portStr.c_str(), &hints, &result);
  if (status != 0 || result == nullptr) {
    return false;
  }

  std::memcpy(addrOut, result->ai_addr, sizeof(sockaddr_in));
  freeaddrinfo(result);
  return true;
}

double Mean(const std::vector<double> &values) {
  if (values.empty()) {
    return 0.0;
  }

  double total = 0.0;
  for (double value : values) {
    total += value;
  }
  return total / static_cast<double>(values.size());
}

double MeanAbsoluteDiff(const std::vector<double> &values) {
  if (values.size() < 2) {
    return 0.0;
  }

  double total = 0.0;
  for (size_t i = 1; i < values.size(); ++i) {
    total += std::abs(values[i] - values[i - 1]);
  }

  return total / static_cast<double>(values.size() - 1);
}

} // namespace

UdpProbeResultNative RunUdpProbe(const std::string &host, int port, int packets,
                                 int payloadBytes, int timeoutMs) {
  UdpProbeResultNative result{};
  result.packetsSent = std::max(1, packets);
  result.packetsReceived = 0;

  sockaddr_in remote{};
  if (!ResolveIPv4(host, port, &remote)) {
    result.success = false;
    result.error = "failed to resolve UDP host";
    result.loss = 1.0;
    return result;
  }

  const SocketHandle fd = socket(AF_INET, SOCK_DGRAM, 0);
  if (fd == kInvalidSocket) {
    result.success = false;
    result.error = "failed to create UDP socket";
    result.loss = 1.0;
    return result;
  }

#ifdef _WIN32
  const DWORD timeout = static_cast<DWORD>(std::max(1, timeoutMs));
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO,
             reinterpret_cast<const char *>(&timeout), sizeof(timeout));
#else
  timeval timeout{};
  timeout.tv_sec = timeoutMs / 1000;
  timeout.tv_usec = (timeoutMs % 1000) * 1000;
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
#endif

  std::vector<double> rtts;
  double receivedBytes = 0.0;

  const auto cycleStart = std::chrono::steady_clock::now();

  for (int i = 0; i < result.packetsSent; ++i) {
    const int payloadSize = std::max(16, payloadBytes);
    std::vector<uint8_t> payload(static_cast<size_t>(payloadSize), 0);

    const auto sendTime = std::chrono::steady_clock::now();
#ifdef _WIN32
    const auto sent = sendto(fd, reinterpret_cast<const char *>(payload.data()),
                             static_cast<int>(payload.size()), 0,
                             reinterpret_cast<const sockaddr *>(&remote),
                             static_cast<int>(sizeof(remote)));
#else
    const auto sent =
        sendto(fd, payload.data(), payload.size(), 0,
               reinterpret_cast<const sockaddr *>(&remote), sizeof(remote));
#endif

    if (sent < 0) {
      continue;
    }

    sockaddr_in from{};
#ifdef _WIN32
    int fromLen = sizeof(from);
#else
    socklen_t fromLen = sizeof(from);
#endif
    std::vector<uint8_t> response(payload.size());
#ifdef _WIN32
    const auto received =
        recvfrom(fd, reinterpret_cast<char *>(response.data()),
                 static_cast<int>(response.size()), 0,
                 reinterpret_cast<sockaddr *>(&from), &fromLen);
#else
    const auto received =
        recvfrom(fd, response.data(), response.size(), 0,
                 reinterpret_cast<sockaddr *>(&from), &fromLen);
#endif

    if (received > 0) {
      const auto receiveTime = std::chrono::steady_clock::now();
      const double rttMs =
          std::chrono::duration_cast<std::chrono::milliseconds>(receiveTime -
                                                                sendTime)
              .count();
      rtts.push_back(std::max(0.1, rttMs));
      result.packetsReceived += 1;
      receivedBytes += static_cast<double>(received);
    }
  }

  CloseSocket(fd);

  const auto cycleEnd = std::chrono::steady_clock::now();
  const double durationSec =
      std::max(0.001, std::chrono::duration_cast<std::chrono::milliseconds>(
                          cycleEnd - cycleStart)
                              .count() /
                          1000.0);

  result.latency = rtts.empty() ? static_cast<double>(timeoutMs) : Mean(rtts);
  result.jitter = MeanAbsoluteDiff(rtts);
  result.loss = 1.0 - (static_cast<double>(result.packetsReceived) /
                       static_cast<double>(result.packetsSent));
  result.throughput = ((receivedBytes * 8.0) / durationSec) / 1'000'000.0;
  result.success = result.packetsReceived > 0;

  if (!result.success && result.error.empty()) {
    result.error = "no UDP responses received";
  }

  return result;
}
