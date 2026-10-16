import { verifyRealtimeReconnect } from "../thread-stages/realtime-reconnect.mjs";

export default {
  id: "realtime-reconnect",
  cases: ["missed-actions"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyRealtimeReconnect,
};
