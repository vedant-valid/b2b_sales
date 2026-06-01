import { listSendingAccounts } from "../../services/instantly.js";

test("listSendingAccounts maps Instantly response to { accountId, email, status }", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      accounts: [
        { account_id: "acc_1", email: "alice@nstx.co.in", status: "active" },
        { account_id: "acc_2", email: "bob@nstx.co.in", status: "warming_up" }
      ]
    })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({ accountId: "acc_1", email: "alice@nstx.co.in", status: "active" });
  expect(result[1]).toEqual({ accountId: "acc_2", email: "bob@nstx.co.in", status: "warming_up" });
});

test("listSendingAccounts handles empty accounts array", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ accounts: [] })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });
  expect(result).toEqual([]);
});
