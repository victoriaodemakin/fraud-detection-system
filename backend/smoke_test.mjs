// Quick end-to-end API smoke test (run with: node smoke_test.mjs)
const BASE = process.argv[2] ?? "http://localhost:5073/api";
let failures = 0;

async function call(method, path, { token, body, device = "smoke-device" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Device-Id": device, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
function check(name, ok, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
}

const cust = await call("POST", "/auth/customer/login", { body: { email: "adaeze@example.com", password: "password123" } });
check("customer login", cust.status === 200);
const t = cust.data.token;
const accountId = cust.data.profile.accounts[0].accountId;

let r = await call("GET", "/bank/dashboard", { token: t });
check("dashboard", r.status === 200, "spend30=" + r.data.spending + " recent=" + r.data.recent?.length);
const LEAK = /riskScore|riskTier|ruleScore|checksFailed|combinedMl|logisticRegression|decisionTree|hybrid|pointsAwarded|"checks"|"outcome"/i;
check("dashboard has no risk data", !LEAK.test(JSON.stringify(r.data)));
r = await call("GET", "/bank/transactions?page=1&pageSize=5", { token: t });
check("transactions list", r.status === 200 && r.data.total > 0, "total=" + r.data.total);
check("list has no risk data", !LEAK.test(JSON.stringify(r.data)));
const firstId = r.data.items[0].transactionId;
r = await call("GET", "/bank/transactions/" + firstId, { token: t });
check("customer transaction detail", r.status === 200 && !!r.data.statusMessage, r.data.status);
check("detail has no risk data", !LEAK.test(JSON.stringify(r.data)));

// normal transfer
r = await call("POST", "/bank/transactions/transfer", { token: t, body: { accountId, recipientName: "Test Payee", recipientAccountNumber: "0123456789", bankName: "GTBank", saveBeneficiary: false, amount: 5000, narration: "smoke", pin: "1234", sim: { location: "lagos", mlProfile: "typical" } } });
check("normal transfer", r.status === 200, r.data.status + " | " + r.data.message);
check("payment result has no risk data", !LEAK.test(JSON.stringify(r.data)));

// suspicious: London, new device, 3am, large, anomalous ML profile
r = await call("POST", "/bank/transactions/transfer", { token: t, body: { accountId, recipientName: "Stranger", recipientAccountNumber: "0999999999", bankName: "X", saveBeneficiary: true, amount: 300000, narration: "urgent", pin: "1234", sim: { location: "london", deviceMode: "new", localTime: "03:10", mlProfile: "anomalous" } } });
check("suspicious transfer submitted", r.status === 200, r.data.status + " | " + r.data.message);
check("suspicious result has no risk data", !LEAK.test(JSON.stringify(r.data)));
const susId = r.data.transactionId;

r = await call("POST", "/bank/transactions/transfer", { token: t, body: { accountId, recipientName: "X", recipientAccountNumber: "0999999999", amount: 100, pin: "0000" } });
check("wrong pin rejected", r.status === 400 && r.data.code === "pin");

r = await call("POST", "/bank/transactions/transfer", { token: t, body: { accountId, recipientName: "Whale", recipientAccountNumber: "0888888888", amount: 6000000, pin: "1234" } });
check("insufficient balance", r.status === 400, r.data.message);

r = await call("GET", "/bank/insights", { token: t });
check("insights has no risk data", !LEAK.test(JSON.stringify(r.data)));
r = await call("GET", "/bank/security", { token: t });
check("security centre", r.status === 200, `devices=${r.data.devices?.length} logins=${r.data.logins?.length}`);
for (const p of ["beneficiaries", "notifications", "insights", "billers", "merchants", "locations"]) {
  r = await call("GET", `/bank/${p}`, { token: t });
  check(`GET /bank/${p}`, r.status === 200);
}

// admin
const adm = await call("POST", "/auth/admin/login", { body: { username: "admin", password: "admin123" } });
check("admin login", adm.status === 200, adm.data.role);
const a = adm.data.token;
r = await call("GET", "/admin/overview?days=14", { token: a });
check("admin overview", r.status === 200, `screened=${r.data.kpis?.totalScreened} pending=${r.data.kpis?.pendingReview} rules=${r.data.topRules?.length}`);
r = await call("GET", "/admin/monitor", { token: a }); check("monitor", r.status === 200);
r = await call("GET", "/admin/transactions?status=PendingReview&page=1", { token: a });
check("admin queue", r.status === 200, `pending=${r.data.total}`);
r = await call("GET", `/admin/transactions/${susId}`, { token: a });
check("admin detail has full analysis", r.status === 200 && r.data.detail.checks.length >= 30, "score=" + r.data.detail.hybrid.riskScore + " tier=" + r.data.detail.hybrid.riskTier + " status=" + r.data.detail.status);
if (r.status === 200) {
  const fails = r.data.detail.checks.filter((c) => c.outcome === "Fail").map((c) => `${c.code}(${c.pointsAwarded})`);
  console.log("      failed rules:", fails.join(", "));
}
r = await call("POST", `/admin/transactions/${susId}/decrypt`, { token: a }); check("decrypt", r.status === 200, r.data.counterparty);
r = await call("POST", `/admin/transactions/${susId}/notes`, { token: a, body: { note: "Checking with the customer." } }); check("note", r.status === 204);
r = await call("GET", "/admin/customers"); check("customers requires auth", r.status === 401);
r = await call("GET", "/admin/customers", { token: a }); check("customers", r.status === 200, `total=${r.data.total}`);
r = await call("GET", "/admin/customers/1", { token: a }); check("customer 360", r.status === 200);
r = await call("GET", "/admin/rules", { token: a }); check("rules", r.status === 200, `rules=${r.data.rules?.length}`);
r = await call("GET", "/admin/audit?page=1", { token: a }); check("audit", r.status === 200, `total=${r.data.total}`);
r = await call("GET", "/admin/database", { token: a }); check("database", r.status === 200, `tables=${r.data.tables?.length} size=${r.data.sizeBytes}`);
r = await call("GET", "/admin/model", { token: a }); check("model", r.status === 200 && r.data.online);
const ev = await call("POST", "/admin/model/evaluate", { token: a, body: { seed: 42 } });
check("evaluation run", ev.status === 200, `run=${ev.data.id ?? JSON.stringify(ev.data)}`);
if (ev.status === 200) {
  r = await call("GET", `/admin/model/runs/${ev.data.id}`, { token: a });
  const d = r.data.result.detectors;
  for (const k of ["rule", "ml", "hybrid"]) console.log(`      ${k}: precision=${d[k].precision} recall=${d[k].recall} f1=${d[k].f1} fpr=${d[k].falsePositiveRate} (tp=${d[k].tp} fp=${d[k].fp} fn=${d[k].fn})`);
}
r = await call("POST", `/admin/transactions/${susId}/review`, { token: a, body: { approve: false, note: "Customer denied this payment." } });
check("review reject", r.status === 200 || r.status === 400, JSON.stringify(r.data));

// analyst (non-admin) cannot change rules
const an = await call("POST", "/auth/admin/login", { body: { username: "analyst", password: "admin123" } });
r = await call("PUT", "/admin/rules/AMT-01", { token: an.data.token, body: { enabled: true, points: 30, parameters: {} } });
check("analyst cannot edit rules", r.status === 403, `status=${r.status}`);

// onboarding
const email = `new${Date.now()}@example.com`;
r = await call("POST", "/auth/register", { body: { fullName: "Test User", email, phone: "08099990000", password: "password123", pin: "4321", address: "1 Test Street, Lagos", nameOnId: "Test User", bvn: "12345678901" }, device: "smoke-device-2" });
check("register", r.status === 200 && r.data.profile.kyc === "Verified", `kyc=${r.data.profile?.kyc}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
