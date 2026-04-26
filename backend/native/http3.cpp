#include "addon.h"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <sstream>

#ifndef _WIN32
#include <sys/wait.h>
#endif

namespace {

double ElapsedMs(const std::chrono::steady_clock::time_point& start,
                 const std::chrono::steady_clock::time_point& end) {
  return std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
}

bool ExitCodeSuccess(int code) {
#ifdef _WIN32
  return code == 0;
#else
  if (code == -1) {
    return false;
  }
  return WIFEXITED(code) && WEXITSTATUS(code) == 0;
#endif
}

}  // namespace

Http3ResultNative RunHttp3Request(const std::string& url, int timeoutMs) {
  Http3ResultNative result{};

#ifdef QUICHE_ENABLED
  const auto started = std::chrono::steady_clock::now();

  // Use a lower idle timeout to prevent long hangs.
  const int effectiveTimeout = std::min(3000, std::max(500, timeoutMs));

  std::ostringstream command;
#ifdef _WIN32
  const char* sink = "NUL";
#else
  const char* sink = "/dev/null";
#endif
  command << "quiche-client --no-verify "
          << "--idle-timeout " << effectiveTimeout << " "
          << "\"" << url << "\" > " << sink << " 2>&1";

  const int code = std::system(command.str().c_str());
  const auto ended = std::chrono::steady_clock::now();

  double latencyMs = std::max(1.0, ElapsedMs(started, ended));

  // Clamp very high values to avoid scoring distortion.
  latencyMs = std::min(latencyMs, 3000.0);

  result.latency = latencyMs;
  result.handshake = std::max(1.0, latencyMs * 0.35);

  bool success = ExitCodeSuccess(code);

  // Treat very slow requests as failure.
  if (latencyMs > 2500) {
    success = false;
  }

  result.success = success;

  if (!result.success) {
    if (!ExitCodeSuccess(code)) {
      result.error = "quiche-client returned non-zero exit code";
    } else {
      result.error = "HTTP/3 too slow (treated as failure)";
    }
  }

#else
  (void)url;
  (void)timeoutMs;
  result.latency = 0.0;
  result.handshake = 0.0;
  result.success = false;
  result.error = "HTTP/3 disabled: rebuild native module with QUICHE_ENABLED=1";
#endif

  return result;
}