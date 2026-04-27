#include <napi.h>

#include "addon.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cerrno>
#include <cstdio>
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
  #include <fcntl.h>
  #include <netdb.h>
  #include <sys/select.h>
  #include <sys/socket.h>
  #include <unistd.h>
#endif

namespace {

#ifdef _WIN32
using SocketHandle = SOCKET;
constexpr SocketHandle kInvalidSocket = INVALID_SOCKET;

int LastSocketError() {
  return WSAGetLastError();
}

bool IsConnectInProgress(int error) {
  return error == WSAEWOULDBLOCK || error == WSAEINPROGRESS || error == WSAEALREADY;
}

bool SetNonBlocking(SocketHandle fd) {
  u_long mode = 1;
  return ioctlsocket(fd, FIONBIO, &mode) == 0;
}

void CloseSocket(SocketHandle fd) {
  closesocket(fd);
}
#else
using SocketHandle = int;
constexpr SocketHandle kInvalidSocket = -1;

int LastSocketError() {
  return errno;
}

bool IsConnectInProgress(int error) {
  return error == EINPROGRESS;
}

bool SetNonBlocking(SocketHandle fd) {
  const int flags = fcntl(fd, F_GETFL, 0);
  if (flags < 0) {
    return false;
  }
  return fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}

void CloseSocket(SocketHandle fd) {
  close(fd);
}
#endif

bool ResolveTcpAddress(const std::string& host, int port, sockaddr_in* addrOut) {
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;

  addrinfo* result = nullptr;
  const std::string portStr = std::to_string(port);
  const int status = getaddrinfo(host.c_str(), portStr.c_str(), &hints, &result);
  if (status != 0 || result == nullptr) {
    return false;
  }

  std::memcpy(addrOut, result->ai_addr, sizeof(sockaddr_in));
  freeaddrinfo(result);
  return true;
}

bool ProbeTcpRtt(const sockaddr_in& addr, int timeoutMs, double* rttOut) {
  const SocketHandle fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd == kInvalidSocket) {
    return false;
  }

  if (!SetNonBlocking(fd)) {
    CloseSocket(fd);
    return false;
  }

  const auto started = std::chrono::steady_clock::now();
  const int connectStatus = connect(fd, reinterpret_cast<const sockaddr*>(&addr), sizeof(addr));

  if (connectStatus < 0 && !IsConnectInProgress(LastSocketError())) {
    CloseSocket(fd);
    return false;
  }

  fd_set writeSet;
  FD_ZERO(&writeSet);
  FD_SET(fd, &writeSet);

  timeval timeout{};
  timeout.tv_sec = timeoutMs / 1000;
  timeout.tv_usec = (timeoutMs % 1000) * 1000;

#ifdef _WIN32
  const int selectStatus = select(0, nullptr, &writeSet, nullptr, &timeout);
#else
  const int selectStatus = select(fd + 1, nullptr, &writeSet, nullptr, &timeout);
#endif
  if (selectStatus <= 0) {
    CloseSocket(fd);
    return false;
  }

  int socketError = 0;
#ifdef _WIN32
  int len = sizeof(socketError);
  getsockopt(fd, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&socketError), &len);
#else
  socklen_t len = sizeof(socketError);
  getsockopt(fd, SOL_SOCKET, SO_ERROR, &socketError, &len);
#endif

  CloseSocket(fd);
  if (socketError != 0) {
    return false;
  }

  const auto ended = std::chrono::steady_clock::now();
  const double elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(ended - started).count();
  *rttOut = std::max(0.1, elapsedMs);
  return true;
}

double Mean(const std::vector<double>& values) {
  if (values.empty()) {
    return 0.0;
  }

  double total = 0.0;
  for (double value : values) {
    total += value;
  }
  return total / static_cast<double>(values.size());
}

double MeanAbsoluteDiff(const std::vector<double>& values) {
  if (values.size() < 2) {
    return 0.0;
  }

  double total = 0.0;
  for (size_t i = 1; i < values.size(); ++i) {
    total += std::abs(values[i] - values[i - 1]);
  }
  return total / static_cast<double>(values.size() - 1);
}

NetworkStatsNative CollectNetworkStats(const std::string& host, int port, int samples, int timeoutMs) {
  NetworkStatsNative output{};
  output.sampleCount = std::max(1, samples);

  sockaddr_in addr{};
  if (!ResolveTcpAddress(host, port, &addr)) {
    output.rtt = timeoutMs;
    output.jitter = 0.0;
    output.loss = 1.0;
    return output;
  }

  std::vector<double> rtts;
  int failures = 0;

  for (int i = 0; i < output.sampleCount; ++i) {
    double rttMs = 0.0;
    if (ProbeTcpRtt(addr, timeoutMs, &rttMs)) {
      rtts.push_back(rttMs);
    } else {
      failures += 1;
    }
  }

  output.rtt = rtts.empty() ? static_cast<double>(timeoutMs) : Mean(rtts);
  output.jitter = MeanAbsoluteDiff(rtts);
  output.loss = static_cast<double>(failures) / static_cast<double>(output.sampleCount);
  return output;
}

Napi::Value GetNetworkStatsWrapped(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string host = "1.1.1.1";
  int port = 443;
  int samples = 8;
  int timeoutMs = 800;

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object input = info[0].As<Napi::Object>();

    if (input.Has("host") && input.Get("host").IsString()) {
      host = input.Get("host").As<Napi::String>().Utf8Value();
    }
    if (input.Has("port") && input.Get("port").IsNumber()) {
      port = input.Get("port").As<Napi::Number>().Int32Value();
    }
    if (input.Has("samples") && input.Get("samples").IsNumber()) {
      samples = input.Get("samples").As<Napi::Number>().Int32Value();
    }
    if (input.Has("timeoutMs") && input.Get("timeoutMs").IsNumber()) {
      timeoutMs = input.Get("timeoutMs").As<Napi::Number>().Int32Value();
    }
  }

  NetworkStatsNative stats = CollectNetworkStats(host, port, samples, timeoutMs);

  Napi::Object output = Napi::Object::New(env);
  output.Set("rtt", Napi::Number::New(env, stats.rtt));
  output.Set("jitter", Napi::Number::New(env, stats.jitter));
  output.Set("loss", Napi::Number::New(env, stats.loss));
  output.Set("sampleCount", Napi::Number::New(env, stats.sampleCount));
  return output;
}

Napi::Value Http3RequestWrapped(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "http3Request expects { url, timeoutMs? }").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object input = info[0].As<Napi::Object>();
  if (!input.Has("url") || !input.Get("url").IsString()) {
    Napi::TypeError::New(env, "http3Request requires a string url").ThrowAsJavaScriptException();
    return env.Null();
  }

  const std::string url = input.Get("url").As<Napi::String>().Utf8Value();
  int timeoutMs = 2000;
  if (input.Has("timeoutMs") && input.Get("timeoutMs").IsNumber()) {
    timeoutMs = input.Get("timeoutMs").As<Napi::Number>().Int32Value();
  }

  Http3ResultNative result = RunHttp3Request(url, timeoutMs);

  Napi::Object output = Napi::Object::New(env);
  output.Set("latency", Napi::Number::New(env, result.latency));
  output.Set("handshake", Napi::Number::New(env, result.handshake));
  output.Set("success", Napi::Boolean::New(env, result.success));
  if (!result.error.empty()) {
    output.Set("error", Napi::String::New(env, result.error));
  }
  return output;
}

Napi::Value UdpProbeWrapped(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "udpProbe expects { host, port, ... }").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object input = info[0].As<Napi::Object>();
  if (!input.Has("host") || !input.Get("host").IsString()) {
    Napi::TypeError::New(env, "udpProbe requires host").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (!input.Has("port") || !input.Get("port").IsNumber()) {
    Napi::TypeError::New(env, "udpProbe requires port").ThrowAsJavaScriptException();
    return env.Null();
  }

  const std::string host = input.Get("host").As<Napi::String>().Utf8Value();
  const int port = input.Get("port").As<Napi::Number>().Int32Value();

  int packets = 8;
  int payloadBytes = 64;
  int timeoutMs = 800;

  if (input.Has("packets") && input.Get("packets").IsNumber()) {
    packets = input.Get("packets").As<Napi::Number>().Int32Value();
  }
  if (input.Has("payloadBytes") && input.Get("payloadBytes").IsNumber()) {
    payloadBytes = input.Get("payloadBytes").As<Napi::Number>().Int32Value();
  }
  if (input.Has("timeoutMs") && input.Get("timeoutMs").IsNumber()) {
    timeoutMs = input.Get("timeoutMs").As<Napi::Number>().Int32Value();
  }

  UdpProbeResultNative result = RunUdpProbe(host, port, packets, payloadBytes, timeoutMs);

  Napi::Object output = Napi::Object::New(env);
  output.Set("latency", Napi::Number::New(env, result.latency));
  output.Set("jitter", Napi::Number::New(env, result.jitter));
  output.Set("loss", Napi::Number::New(env, result.loss));
  output.Set("throughput", Napi::Number::New(env, result.throughput));
  output.Set("success", Napi::Boolean::New(env, result.success));
  output.Set("packetsSent", Napi::Number::New(env, result.packetsSent));
  output.Set("packetsReceived", Napi::Number::New(env, result.packetsReceived));
  if (!result.error.empty()) {
    output.Set("error", Napi::String::New(env, result.error));
  }
  return output;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {

#ifdef _WIN32
  static bool initialized = false;
  if (!initialized) {
    WSADATA wsaData;
    int res = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (res != 0) {
      printf("WSAStartup failed: %d\n", res);
    }
    initialized = true;
  }
#endif

  exports.Set("getNetworkStats", Napi::Function::New(env, GetNetworkStatsWrapped));
  exports.Set("http3Request", Napi::Function::New(env, Http3RequestWrapped));
  exports.Set("udpProbe", Napi::Function::New(env, UdpProbeWrapped));

  return exports;
}

}  // namespace

NODE_API_MODULE(optimizer_native, Init)
