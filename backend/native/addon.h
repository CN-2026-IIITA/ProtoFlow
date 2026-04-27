#pragma once

#include <string>

struct NetworkStatsNative {
  double rtt;
  double jitter;
  double loss;
  int sampleCount;
};

struct Http3ResultNative {
  double latency;
  double handshake;
  bool success;
  std::string error;
};

struct UdpProbeResultNative {
  double latency;
  double jitter;
  double loss;
  double throughput;
  bool success;
  int packetsSent;
  int packetsReceived;
  std::string error;
};

Http3ResultNative RunHttp3Request(const std::string& url, int timeoutMs);
UdpProbeResultNative RunUdpProbe(const std::string& host, int port, int packets, int payloadBytes, int timeoutMs);
