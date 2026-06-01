import { listSendingAccounts } from "../../services/instantly.js";

test("listSendingAccounts maps Instantly response to { accountId, email, status }", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      items: [
        { email: "alice@nstx.co.in", status: 1 },
        { email: "bob@nstx.co.in", status: -1 }
      ]
    })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({ accountId: "alice@nstx.co.in", email: "alice@nstx.co.in", status: "active" });
  expect(result[1]).toEqual({ accountId: "bob@nstx.co.in", email: "bob@nstx.co.in", status: "inactive" });
});

test("listSendingAccounts handles empty items array", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ items: [] })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });
  expect(result).toEqual([]);
});
