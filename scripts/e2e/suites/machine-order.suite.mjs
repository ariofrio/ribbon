import { verifyMachineOrder } from "../thread-stages/machine-order.mjs";

export default {
  group: "ordering",
  order: 12,
  id: "machine-order",
  cases: ["independent"],
  plugins: ["bb-plugin-thread-stages"],
  run: verifyMachineOrder,
};
