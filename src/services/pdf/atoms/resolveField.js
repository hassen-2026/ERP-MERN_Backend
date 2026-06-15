module.exports = function resolveField(client, f1, f2) {
  if (!client) return "-";
  if (typeof client === "string") return client;
  return client[f1] || client[f2] || "-";
};
