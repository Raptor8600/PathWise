/**
 * Pathwise — script.js
 * Comprehensive financial tools suite.
 * Created by Raptor8600
 */

(() => {
    "use strict";

    const STORAGE_KEY = "pathwise_form_state_v1";
    const PREF_KEY = "pathwise_remember_device_v1";
    const FORM_ROOT_ID = "pathwise-form";

    const PERIODS = {
        year: 1,
        month: 12,
        biweekly: 26,
        weekly: 52,
        day: 260,
        hour: 2080
    };

    const BLURBS = {
        growth: "Compound interest is 'interest on interest.' Start of Month means you invest before the bank calculates growth, maximizing your earnings immediately. End of Month means you invest after, so that specific payment starts earning next month. Over 20 years, that 'head start' can add thousands to your total.",
        debt: "Paying off debt isn't just about the balance; it's about the interest. By paying more than the minimum, you directly reduce the principal that interest is calculated on, saving months or years of payments.",
        utilization: "Your credit score is a 'risk' grade. While utilization is a huge 30%, payment history is even bigger (35%). Keeping balances low and accounts old shows lenders you are reliable over the long term.",
        loan: "Amortization is the process of paying off debt in regular installments. Early on, most of your payment goes to interest. As the balance drops, more goes toward the principal. This is why car and home loans start slow!",
        goal: "Reaching a goal requires a balance of time and contributions. High-yield accounts help, but consistency (the 'monthly' amount) is usually the biggest driver for short-term goals under 5 years.",
        inflation: "Inflation is the 'hidden tax' that erodes purchasing power. $1,000 today might only buy $700 worth of goods in a decades' time. This is why investing is crucial—to outpace the rising cost of living.",
        salarytax: "Tax systems are layered. Your 'marginal rate' is what you pay on the very last dollar you earned, while your 'average rate' is the total tax divided by total income. Understanding this helps you see the actual impact of a raise or bonus."
    };

    // ---------- Helpers ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const fmtMoney = (n) => {
        const x = Number(n);
        if (!Number.isFinite(x)) return "$0";
        return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
    };

    const parseNum = (v) => {
        const x = Number(String(v ?? "").trim());
        return Number.isFinite(x) ? x : 0;
    };

    // ---------- Storage ----------
    const getRememberPref = () => localStorage.getItem(PREF_KEY) === "true";
    const setRememberPref = (val) => localStorage.setItem(PREF_KEY, val ? "true" : "false");
    const getStorage = () => (getRememberPref() ? localStorage : sessionStorage);

    const readState = () => {
        const raw = getStorage().getItem(STORAGE_KEY);
        if (!raw) return {};
        try {
            const obj = JSON.parse(raw);
            return obj && typeof obj === "object" ? obj : {};
        } catch {
            return {};
        }
    };

    const writeState = (state) => {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
    };

    const migrateState = (toLocal) => {
        const from = toLocal ? sessionStorage : localStorage;
        const to = toLocal ? localStorage : sessionStorage;
        const data = from.getItem(STORAGE_KEY);
        if (data != null) {
            to.setItem(STORAGE_KEY, data);
            from.removeItem(STORAGE_KEY);
        }
    };

    const getFormRoot = () => document.getElementById(FORM_ROOT_ID);

    const getFields = () => {
        const root = getFormRoot();
        if (!root) return [];
        return $$("input, select, textarea", root).filter((el) => {
            if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement))
                return false;
            if (el.id === "rememberDevice") return false;
            if (el.disabled) return false;
            return Boolean(el.id || el.name);
        });
    };

    const captureFormToState = () => {
        const state = {};
        for (const el of getFields()) {
            const key = el.id || el.name;
            if (el instanceof HTMLInputElement && el.type === "checkbox") {
                state[key] = el.checked;
            } else if (el instanceof HTMLInputElement && el.type === "radio") {
                if (el.checked) state[key] = el.value;
            } else {
                state[key] = el.value;
            }
        }
        // Custom capture for salary sources
        if ($("#t_income_list")) {
            const sources = $$(".t-income-row", $("#t_income_list")).map(row => ({
                label: $(".t-label", row)?.value || '',
                gross: $(".t-gross", row)?.value || '',
                period: $(".t-period", row)?.value || 'year',
                state: $(".t-state", row)?.value || 'IL'
            }));
            state.salary_sources = sources;
        }
        return state;
    };

    const applyStateToForm = (state) => {
        for (const el of getFields()) {
            const key = el.id || el.name;
            if (!(key in state)) continue;
            if (el instanceof HTMLInputElement && el.type === "checkbox") {
                el.checked = Boolean(state[key]);
            } else if (el instanceof HTMLInputElement && el.type === "radio") {
                el.checked = el.value === state[key];
            } else {
                el.value = state[key];
            }
        }
        // Custom apply for salary sources
        if (state.salary_sources && globalThis.initSalaryTaxRows) {
            globalThis.initSalaryTaxRows(state.salary_sources);
        }
    };

    globalThis.saveNow = () => writeState(captureFormToState());
    const saveNow = globalThis.saveNow;

    // ---------- Tabs ----------
    const showTab = (name, save = true) => {
        if (!name) name = "growth";
        $$("section.card[id^='tab-']").forEach((sec) => {
            sec.style.display = sec.id === `tab-${name}` ? "block" : "none";
        });
        $$("[data-tab]").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === name);
        });
        const learnTxt = $("#learn-text");
        if (learnTxt && BLURBS[name]) {
            learnTxt.textContent = BLURBS[name];
        }
        if (save) {
            const state = readState();
            state.activeTab = name;
            writeState(state);
        }
    };

    // ---------- Calculations ----------
    let sChartInstance = null;

    const calcGrowth = () => {
        const start = Math.max(0, parseNum($("#g_start")?.value));
        const monthly = Math.max(0, parseNum($("#g_monthly")?.value));
        const ratePct = Math.max(0, parseNum($("#g_rate")?.value));
        const variancePct = Math.max(0, parseNum($("#g_variance")?.value));
        const timeInput = Math.max(0, parseNum($("#g_time")?.value));
        const unit = $("#g_unit")?.value || "years";
        const months = unit === "years" ? Math.round(timeInput * 12) : Math.round(timeInput);
        const compoundFreq = parseNum($("#g_freq")?.value) || 12;
        const timing = $("#g_timing")?.value || "end";

        const runScenario = (pct) => {
            const r = pct / 100;
            let bal = start;
            const hist = [start];
            const meta = { balance: start, interest: 0, contributed: 0 };
            let compoundingBase = start;
            const monthsPerPeriod = 12 / compoundFreq;

            for (let m = 0; m < months; m++) {
                const earningBase = (timing === "start") ? (bal + monthly) : bal;
                if (timing === "start") {
                    bal += monthly;
                    meta.contributed += monthly;
                    if (m % monthsPerPeriod === 0) compoundingBase = bal;
                }
                if (compoundFreq >= 12) {
                    const effMonthly = Math.pow(1 + r / compoundFreq, compoundFreq / 12) - 1;
                    const intNow = earningBase * effMonthly;
                    bal += intNow;
                    meta.interest += intNow;
                } else if ((m + 1) % monthsPerPeriod === 0 || m === months - 1) {
                    const intNow = compoundingBase * (r / compoundFreq);
                    bal += intNow;
                    meta.interest += intNow;
                    compoundingBase = bal;
                }
                if (timing === "end") {
                    bal += monthly;
                    meta.contributed += monthly;
                }
                if (compoundFreq < 12 && (m + 1) % monthsPerPeriod === 0) {
                    compoundingBase = bal;
                }
                if (months <= 24 || (m + 1) % 12 === 0 || m === months - 1) {
                    hist.push(bal);
                }
            }
            meta.balance = bal;
            return { hist, meta };
        };

        const base = runScenario(ratePct);
        const zero = runScenario(0);
        const high = variancePct > 0 ? runScenario(ratePct + variancePct) : null;
        const low = variancePct > 0 ? runScenario(ratePct - variancePct) : null;

        const labels = ["Start"];
        for (let m = 0; m < months; m++) {
            if (months <= 24 || (m + 1) % 12 === 0 || m === months - 1) {
                labels.push(unit === "years" ? `Yr ${Math.floor((m + 1) / 12)}` : `Mo ${m + 1}`);
            }
        }

        if ($("#g_final")) $("#g_final").textContent = fmtMoney(base.meta.balance);
        if ($("#g_contrib")) $("#g_contrib").textContent = fmtMoney(base.meta.contributed);
        if ($("#g_interest")) $("#g_interest").textContent = fmtMoney(base.meta.interest);
        if ($("#g_out_time")) $("#g_out_time").textContent = unit === "years" ? `${timeInput} yrs` : `${months} mos`;
        if ($("#g_avg_interest")) $("#g_avg_interest").textContent = months > 0 ? fmtMoney(base.meta.interest / months) : "$0";

        updateGrowthTable(labels, base, high, low, ratePct, variancePct);
        renderGrowthChart(labels, base.hist, high?.hist, low?.hist, ratePct, variancePct, zero.hist);
    };

    const updateGrowthTable = (labels, base, high, low, rate, varPct) => {
        const thead = $("#g_table_head");
        const tbody = $("#g_table_body");
        if (!thead || !tbody) return;
        let headHtml = `<th>Time</th><th>Base (${rate}%)</th>`;
        if (high) headHtml = `<th>Time</th><th>High (${(rate + varPct).toFixed(1)}%)</th>` + headHtml.replace("<th>Time</th>", "") + `<th>Low (${(rate - varPct).toFixed(1)}%)</th>`;
        thead.innerHTML = headHtml;
        let bodyHtml = "";
        labels.forEach((label, i) => {
            bodyHtml += `<tr><td>${label}</td>`;
            if (high) bodyHtml += `<td>${fmtMoney(high.hist[i])}</td>`;
            bodyHtml += `<td>${fmtMoney(base.hist[i])}</td>`;
            if (low) bodyHtml += `<td>${fmtMoney(low.hist[i])}</td>`;
            bodyHtml += `</tr>`;
        });
        tbody.innerHTML = bodyHtml;
    };

    const renderGrowthChart = (labels, baseHist, highHist, lowHist, rate, varPct, zeroHist) => {
        const canvas = $("#g_chart");
        if (!canvas || typeof Chart === "undefined") return;
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
        const datasets = [];
        if (zeroHist && rate > 0) {
            datasets.push({ label: `0% Interest`, data: zeroHist, borderColor: '#64748b', borderDash: [5, 5], pointRadius: 0, tension: 0.1 });
        }
        if (highHist) {
            datasets.push({ label: `High (${(rate + varPct).toFixed(1)}%)`, data: highHist, borderColor: '#4ade80', borderWidth: 2, pointRadius: 2, tension: 0.3 });
        }
        datasets.push({ label: `Base (${rate.toFixed(1)}%)`, data: baseHist, borderColor: '#B59B6A', backgroundColor: 'rgba(181, 155, 106, 0.1)', fill: true, borderWidth: 3, tension: 0.3, pointRadius: 4 });
        if (lowHist) {
            datasets.push({ label: `Low (${(rate - varPct).toFixed(1)}%)`, data: lowHist, borderColor: '#f87171', borderWidth: 2, pointRadius: 2, tension: 0.3 });
        }
        new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: 'rgba(11, 20, 32, 0.95)', callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw)}` } } },
                scales: {
                    y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8", callback: (v) => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v } },
                    x: { ticks: { color: "#94a3b8" }, grid: { display: false } }
                }
            }
        });
    };

    const calcDebt = () => {
        const bal0 = Math.max(0, parseNum($("#d_balance")?.value));
        const aprPct = Math.max(0, parseNum($("#d_apr")?.value));
        const payment = Math.max(0, parseNum($("#d_payment")?.value));
        const extra = Math.max(0, parseNum($("#d_extra")?.value));
        const r = (aprPct / 100) / 12;
        const monthlyPay = payment + extra;
        const setOut = (time, totalPaid, totalInt, warn) => {
            if ($("#d_time")) $("#d_time").textContent = time;
            if ($("#d_total_paid")) $("#d_total_paid").textContent = totalPaid;
            if ($("#d_total_interest")) $("#d_total_interest").textContent = totalInt;
            if ($("#d_warn")) $("#d_warn").textContent = warn;
        };
        if (bal0 <= 0) return setOut("0 months", fmtMoney(0), fmtMoney(0), "—");
        if (monthlyPay <= 0) return setOut("—", "$0", "$0", "Payment must be > 0.");
        const firstInterest = bal0 * r;
        if (monthlyPay <= firstInterest) return setOut("—", "—", "—", "Payment too low.");
        let balance = bal0, months = 0, totalInterest = 0, totalPaid = 0;
        while (balance > 0.005 && months < 1200) {
            const interest = balance * r;
            totalInterest += interest;
            balance += interest;
            const payThisMonth = Math.min(monthlyPay, balance);
            balance -= payThisMonth;
            totalPaid += payThisMonth;
            months++;
        }
        const yrs = Math.floor(months / 12), rem = months % 12;
        const timeStr = yrs > 0 ? `${yrs}y ${rem}m (${months}m)` : `${months} months`;
        setOut(timeStr, fmtMoney(totalPaid), fmtMoney(totalInterest), "—");
    };

    const calcUtilization = () => {
        const balance = parseNum($("#u_balance")?.value);
        const limit = parseNum($("#u_limit")?.value);
        const age = parseNum($("#u_age")?.value);
        const inquiries = parseNum($("#u_inquiries")?.value);
        const late = parseNum($("#u_late")?.value);
        const totalAcc = parseNum($("#u_total_acc")?.value);
        let score = 0;
        const rate = limit > 0 ? (balance / limit) * 100 : 0;
        if (limit > 0) {
            if (rate < 10) score += 30; else if (rate < 30) score += 25; else if (rate < 50) score += 15; else if (rate < 70) score += 5;
        }
        if (late === 0) score += 35; else if (late === 1) score += 15; else if (late === 2) score += 5;
        if (age >= 7) score += 15; else if (age >= 5) score += 12; else if (age >= 3) score += 8; else if (age >= 1) score += 4;
        if (inquiries === 0) score += 10; else if (inquiries === 1) score += 8; else if (inquiries === 2) score += 5; else if (inquiries === 3) score += 2;
        if (totalAcc >= 6) score += 10; else if (totalAcc >= 4) score += 8; else if (totalAcc >= 2) score += 5; else if (totalAcc >= 1) score += 2;
        let grade = "Very Poor (F)", advice = "Focus on rebuilding.";
        if (score >= 90) { grade = "Excellent (A)"; advice = "Excellent! Maintain low balances."; }
        else if (score >= 80) { grade = "Good (B)"; advice = "Good health. Aim for < 10% utilization."; }
        else if (score >= 70) { grade = "Fair (C)"; advice = "Fair. Reduce balances."; }
        else if (score >= 60) { grade = "Poor (D)"; advice = "Poor. Focus on on-time payments."; }
        if (late > 0) advice = "Priority: Ensure all future payments are on time.";
        else if (rate > 50) advice = "Priority: Pay down high balances.";
        if ($("#u_rate")) $("#u_rate").textContent = rate.toFixed(1) + "%";
        if ($("#u_zone")) $("#u_zone").textContent = grade;
        if ($("#u_goal")) $("#u_goal").textContent = advice;
    };

    const calcLoan = () => {
        const p = parseNum($("#l_amount")?.value);
        const apr = parseNum($("#l_apr")?.value);
        const term = parseNum($("#l_term")?.value);
        const unit = $("#l_unit")?.value || "years";
        const n = unit === "years" ? term * 12 : term;
        const r = (apr / 100) / 12;
        if (p <= 0 || n <= 0) return;
        let monthly = r === 0 ? p / n : p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const totalCost = monthly * n, totalInt = totalCost - p;
        if ($("#l_monthly")) $("#l_monthly").textContent = fmtMoney(monthly);
        if ($("#l_total_interest")) $("#l_total_interest").textContent = fmtMoney(totalInt);
        if ($("#l_total_cost")) $("#l_total_cost").textContent = fmtMoney(totalCost);
    };

    const calcGoal = () => {
        const target = parseNum($("#s_target")?.value);
        const start = parseNum($("#s_start")?.value);
        const years = parseNum($("#s_time")?.value);
        const ratePct = parseNum($("#s_rate")?.value);
        const freq = parseNum($("#s_freq")?.value) || 1;
        const timing = $("#s_timing")?.value || "end";

        if (target <= 0 || years <= 0) return;

        const months = years * 12;
        const r = ratePct / 100;

        let monthlyNeeded = 0;
        if (target <= start) {
            monthlyNeeded = 0;
        } else if (r === 0) {
            monthlyNeeded = (target - start) / months;
        } else {
            let low = 0, high = target;
            for (let i = 0; i < 35; i++) {
                let mid = (low + high) / 2;
                let testBal = start;
                let cBase = start;
                const mPerComp = 12 / freq;

                for (let m = 0; m < months; m++) {
                    const earnsThisMonth = (timing === "start") ? (testBal + mid) : testBal;
                    if (timing === "start") {
                        testBal += mid;
                        if (m % mPerComp === 0) cBase = testBal;
                    }
                    if ((m + 1) % mPerComp === 0 || m === months - 1) {
                        const intNow = (freq >= 12)
                            ? (earnsThisMonth * (Math.pow(1 + r / freq, freq / 12) - 1))
                            : (cBase * (r / freq));
                        testBal += intNow;
                    }
                    if (timing === "end") testBal += mid;
                    if ((m + 1) % mPerComp === 0) cBase = testBal;
                }
                if (testBal < target) low = mid;
                else high = mid;
            }
            monthlyNeeded = high;
        }

        if ($("#s_monthly_needed")) $("#s_monthly_needed").textContent = fmtMoney(monthlyNeeded);
        if ($("#s_out_time")) $("#s_out_time").textContent = years;
        if ($("#s_out_goal")) $("#s_out_goal").textContent = fmtMoney(target);
        if ($("#s_result_container")) $("#s_result_container").style.display = "block";

        // Chart sim
        let bal = start, cBase = start, totalDeposits = 0;
        const histStarting = [start], histDeposits = [0], histInterest = [0], labels = ["Start"];
        const mPerComp = 12 / freq;

        for (let m = 0; m < months; m++) {
            const earnsThisMonth = (timing === "start") ? (bal + monthlyNeeded) : bal;
            if (timing === "start") {
                bal += monthlyNeeded; totalDeposits += monthlyNeeded;
                if (m % mPerComp === 0) cBase = bal;
            }
            if ((m + 1) % mPerComp === 0 || m === months - 1) {
                bal += (freq >= 12) ? (earnsThisMonth * (Math.pow(1 + r / freq, freq / 12) - 1)) : (cBase * (r / freq));
            }
            if (timing === "end") { bal += monthlyNeeded; totalDeposits += monthlyNeeded; }
            if ((m + 1) % mPerComp === 0) cBase = bal;

            if ((m + 1) % 12 === 0 || m === months - 1) {
                histStarting.push(start);
                histDeposits.push(totalDeposits);
                histInterest.push(Math.max(0, bal - start - totalDeposits));
                labels.push(`Yr ${Math.floor((m + 1) / 12)}`);
            }
        }
        if ($("#s_contrib")) $("#s_contrib").textContent = fmtMoney(totalDeposits);
        if ($("#s_interest")) $("#s_interest").textContent = fmtMoney(bal - start - totalDeposits);
        renderGoalChart(labels, histStarting, histDeposits, histInterest);
    };

    const renderGoalChart = (labels, starting, deposits, interest) => {
        const canvas = $("#s_chart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (sChartInstance) sChartInstance.destroy();
        const datasets = [];
        const showInterest = Math.max(...interest) > 0.01;

        if (showInterest) {
            datasets.push({
                label: "Growth (Interest)",
                data: interest.map((v, i) => v + deposits[i] + starting[i]),
                borderColor: "#10b981",
                backgroundColor: "rgba(16,185,129,0.3)",
                fill: true,
                tension: 0.3,
                pointRadius: 0
            });
        }
        datasets.push({
            label: "Your Deposits",
            data: deposits.map((v, i) => v + starting[i]),
            borderColor: "#f43f5e",
            backgroundColor: "rgba(244,63,94,0.3)",
            fill: true,
            tension: 0.3,
            pointRadius: 0
        });
        datasets.push({
            label: "Starting Balance",
            data: starting,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.3)",
            fill: true,
            tension: 0.3,
            pointRadius: 0
        });

        sChartInstance = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { color: "#94a3b8", usePointStyle: true } },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => {
                                let val = ctx.raw;
                                const dsLabel = ctx.dataset.label;
                                if (dsLabel === "Growth (Interest)") {
                                    val = ctx.raw - deposits[ctx.dataIndex] - starting[ctx.dataIndex];
                                } else if (dsLabel === "Your Deposits") {
                                    val = ctx.raw - starting[ctx.dataIndex];
                                }
                                return `${dsLabel}: ${fmtMoney(val)}`;
                            },
                            footer: (items) => {
                                const total = items[0].raw;
                                return `Total: ${fmtMoney(total)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(255,255,255,0.05)" },
                        ticks: { color: "#94a3b8", callback: (v) => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v }
                    },
                    x: { ticks: { color: "#94a3b8" }, grid: { display: false } }
                }
            }
        });
    };

    const calcInflation = () => {
        const amount = parseNum($("#i_amount")?.value);
        const ratePct = parseNum($("#i_rate")?.value);
        const years = parseNum($("#i_time")?.value) / ($("#i_unit")?.value === "months" ? 12 : 1);
        const future = amount * Math.pow(1 + ratePct / 100, years);
        const today = amount / Math.pow(1 + ratePct / 100, years);
        if ($("#i_future")) $("#i_future").textContent = fmtMoney(future);
        if ($("#i_today")) $("#i_today").textContent = fmtMoney(today);
        if ($("#i_loss")) $("#i_loss").textContent = amount > 0 ? ((amount - today) / amount * 100).toFixed(1) + "%" : "0%";
    };

    const calcAll = () => {
        calcGrowth(); calcDebt(); calcUtilization(); calcLoan(); calcGoal(); calcInflation();
        if (typeof globalThis.runSalaryCalcGlobal === "function") globalThis.runSalaryCalcGlobal();
    };

    const clearAll = () => {
        if (!confirm("Are you sure? This will delete all saved data and reset all tools to zero.")) return;
        localStorage.clear(); sessionStorage.clear();
        globalThis.location.reload();
    };

    // ---------- Salary Tax Engine ----------
    const FED_2022 = {
        stdDed: 12950,
        brackets: [
            { limit: 10275, rate: 0.10 }, { limit: 41775, rate: 0.12 }, { limit: 89075, rate: 0.22 },
            { limit: 170050, rate: 0.24 }, { limit: 215950, rate: 0.32 }, { limit: 539900, rate: 0.35 }, { limit: Infinity, rate: 0.37 }
        ]
    };
    const calcProgressive = (taxable, brackets) => {
        let tax = 0, lastLimit = 0;
        for (const b of brackets) {
            const amt = Math.max(0, Math.min(taxable, b.limit) - lastLimit);
            tax += amt * b.rate; lastLimit = b.limit;
            if (taxable <= b.limit) break;
        }
        return tax;
    };

    // Calibration helper for complex states
    const findAdjustment = (target, annualGross, brackets, stdDed) => {
        for (let adj = -10000; adj < 20000; adj++) {
            const taxable = Math.max(0, annualGross - stdDed - adj);
            const tax = Math.round(calcProgressive(taxable, brackets));
            if (tax === target) return adj;
        }
        return 0;
    };

    const NY_ADJ = findAdjustment(2571, 55000, [{ limit: 8500, rate: 0.04 }, { limit: 11700, rate: 0.045 }, { limit: 13900, rate: 0.0525 }, { limit: 21400, rate: 0.0585 }, { limit: 80650, rate: 0.0625 }, { limit: Infinity, rate: 0.0685 }], 8000);
    const CA_ADJ = findAdjustment(4907, 85000, [{ limit: 10099, rate: 0.01 }, { limit: 23942, rate: 0.02 }, { limit: 37788, rate: 0.04 }, { limit: 52455, rate: 0.06 }, { limit: 66295, rate: 0.08 }, { limit: 338639, rate: 0.093 }, { limit: Infinity, rate: 0.103 }], 5202);
    const MN_ADJ = findAdjustment(3449, 60700, [{ limit: 28080, rate: 0.0535 }, { limit: 92270, rate: 0.0705 }, { limit: 166400, rate: 0.0785 }, { limit: Infinity, rate: 0.0985 }], 12900);

    const STATE_TAX_POINTS = { "AL": 3437, "AK": 0, "AZ": 2295, "AR": 3427, "CA": 4907, "CO": 3686, "CT": 6367, "DE": 4379, "DC": 5625, "FL": 0, "GA": 4405, "HI": 6449, "ID": 4091, "IL": 4208, "IN": 2746, "IA": 4071, "KS": 4188, "KY": 4112, "LA": 3032, "ME": 4919, "MD": 3924, "MA": 4443, "MI": 3613, "MN": 5101, "MS": 3835, "MO": 3634, "MT": 4678, "NE": 4741, "NV": 0, "NH": 0, "NJ": 2543, "NM": 3577, "NY": 4782, "NC": 3678, "ND": 1209, "OH": 2503, "OK": 3547, "OR": 6436, "PA": 2661, "RI": 4252, "SC": 5450, "SD": 0, "TN": 0, "TX": 0, "UT": 4123, "VT": 4026, "VA": 4170, "WA": 0, "WV": 4400, "WI": 4198, "WY": 0 };

    const STATE_MODELS = {};
    Object.keys(STATE_TAX_POINTS).forEach(s => {
        STATE_MODELS[s] = (gross) => {
            const results = { lines: [], employer: Math.round(gross * 0.0765 + 420) };
            if (s === 'IL') {
                results.lines.push({ name: 'State Income Tax', amount: Math.round(gross * 0.0495) });
                results.employer = Math.round(gross * (0.0765 + 0.0084));
            } else if (s === 'MN') {
                const taxable = Math.max(0, gross - 12900 - MN_ADJ);
                results.lines.push({ name: 'State Income Tax', amount: Math.round(calcProgressive(taxable, [{ limit: 28080, rate: 0.0535 }, { limit: 92270, rate: 0.0705 }, { limit: 166400, rate: 0.0785 }, { limit: Infinity, rate: 0.0985 }])) });
            } else if (s === 'NY') {
                results.lines.push({ name: 'NY FLI/SDI', amount: Math.round(gross * 0.00511 + Math.min(gross * 0.005, 31.2)) });
                const taxable = Math.max(0, gross - 8000 - NY_ADJ);
                results.lines.push({ name: 'State Income Tax', amount: Math.round(calcProgressive(taxable, [{ limit: 8500, rate: 0.04 }, { limit: 11700, rate: 0.045 }, { limit: 13900, rate: 0.0525 }, { limit: 21400, rate: 0.0585 }, { limit: 80650, rate: 0.0625 }, { limit: Infinity, rate: 0.0685 }])) });
            } else if (s === 'CA') {
                results.lines.push({ name: 'CA SDI', amount: Math.round(gross * 0.011) });
                const taxable = Math.max(0, gross - 5202 - CA_ADJ);
                results.lines.push({ name: 'State Income Tax', amount: Math.round(calcProgressive(taxable, [{ limit: 10099, rate: 0.01 }, { limit: 23942, rate: 0.02 }, { limit: 37788, rate: 0.04 }, { limit: 52455, rate: 0.06 }, { limit: 66295, rate: 0.08 }, { limit: 338639, rate: 0.093 }, { limit: Infinity, rate: 0.103 }])) });
            } else {
                const taxRate = STATE_TAX_POINTS[s] / 85000;
                if (taxRate > 0) results.lines.push({ name: 'State Income Tax', amount: Math.round(gross * taxRate) });
            }
            return results;
        };
    });

    function initSalaryTax() {
        const list = $("#t_income_list");
        if (!list) return;

        const createRow = (data = {}) => {
            const row = document.createElement("div");
            row.className = "t-income-row";
            row.innerHTML = `
                <div class="t-row-header"><h3>Income Source</h3><button class="btn delete" type="button">Remove</button></div>
                <div class="grid">
                    <label>Label<input class="t-label" type="text" value="${data.label || ''}" /></label>
                    <label>Gross ($)<input class="t-gross" type="number" step="0.01" value="${data.gross || ''}" /></label>
                    <label>Per<select class="t-period">
                        <option value="year" ${data.period === 'year' ? 'selected' : ''}>Year</option>
                        <option value="month" ${data.period === 'month' ? 'selected' : ''}>Month</option>
                        <option value="biweekly" ${data.period === 'biweekly' ? 'selected' : ''}>Biweekly</option>
                        <option value="weekly" ${data.period === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="hour" ${data.period === 'hour' ? 'selected' : ''}>Hour</option>
                    </select></label>
                    <label>State<select class="t-state">${Object.keys(STATE_TAX_POINTS).map(s => `<option value="${s}" ${data.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
                </div>
                <div class="t-row-output"></div>
            `;
            row.querySelector(".delete").onclick = () => { row.remove(); updateRowSequence(); saveNow(); calcAll(); };
            return row;
        };

        const updateRowSequence = () => {
            $$(".t-income-row", list).forEach((r, i) => { if (r.querySelector("h3")) r.querySelector("h3").textContent = `Income Source #${i + 1}`; });
        };

        globalThis.initSalaryTaxRows = (rows) => {
            list.innerHTML = "";
            if (rows && rows.length) rows.forEach(r => list.appendChild(createRow(r)));
            else list.appendChild(createRow());
            updateRowSequence();
        };

        $("#t_add_income")?.addEventListener("click", () => { list.appendChild(createRow()); updateRowSequence(); saveNow(); });
        $("#t_calc")?.addEventListener("click", () => { if (typeof globalThis.runSalaryCalcGlobal === "function") globalThis.runSalaryCalcGlobal(); });

        globalThis.runSalaryCalcGlobal = () => {
            const rows = $$(".t-income-row", list);
            let tg = 0, tt = 0, tn = 0, te = 0;
            const comp = [];

            rows.forEach(row => {
                const label = $(".t-label", row).value || "Income Source";
                const gVal = parseNum($(".t-gross", row).value), period = $(".t-period", row).value, state = $(".t-state", row).value;
                const annualGross = gVal * PERIODS[period];

                const fed = calcProgressive(Math.max(0, annualGross - FED_2022.stdDed), FED_2022.brackets);
                const fica = Math.min(annualGross, 147000) * 0.062 + (annualGross * 0.0145 + Math.max(0, annualGross - 200000) * 0.009);
                const stModel = STATE_MODELS[state] || { lines: [], employer: Math.round(annualGross * 0.0765) };
                const stRes = stModel(annualGross);
                const st = stRes.lines.reduce((a, b) => a + b.amount, 0);

                const totalTax = fed + fica + st, net = annualGross - totalTax;
                const periodFactor = 1 / PERIODS[period];

                row.querySelector(".t-row-output").innerHTML = `
                    <div class="t-withholding">
                        <div class="t-line"><span>Annual Gross</span><span>${fmtMoney(annualGross)}</span></div>
                        <div class="t-line"><span>Federal Tax</span><span>${fmtMoney(fed)}</span></div>
                        <div class="t-line"><span>FICA (SS/Med)</span><span>${fmtMoney(fica)}</span></div>
                        ${stRes.lines.map(l => `<div class="t-line"><span>${l.name}</span><span>${fmtMoney(l.amount)}</span></div>`).join('')}
                        <div class="t-line total"><span>Total Tax</span><span>${fmtMoney(totalTax)}</span></div>
                        <div class="t-line net"><span>Net Pay</span><span>${fmtMoney(net)}</span></div>
                    </div>
                `;
                tg += annualGross; tt += totalTax; tn += net; te += stRes.employer;
                comp.push({ label, state, gross: annualGross, tax: totalTax, net, avg: annualGross > 0 ? (totalTax / annualGross * 100) : 0 });
            });

            if ($("#t_total_gross")) $("#t_total_gross").textContent = fmtMoney(tg);
            if ($("#t_total_tax")) $("#t_total_tax").textContent = fmtMoney(tt);
            if ($("#t_total_net")) $("#t_total_net").textContent = fmtMoney(tn);
            if ($("#t_combined_avg")) $("#t_combined_avg").textContent = tg > 0 ? (tt / tg * 100).toFixed(1) + "%" : "0%";
            if ($("#t_combined_totals")) $("#t_combined_totals").style.display = tg > 0 ? "grid" : "none";

            if ($("#t_compare_container")) $("#t_compare_container").style.display = tg > 0 ? "block" : "none";
            if ($("#t_compare_body")) $("#t_compare_body").innerHTML = comp.map(d => `
                <tr><td>${d.label}</td><td>${d.state}</td><td>${fmtMoney(d.gross)}</td><td>${fmtMoney(d.tax)}</td><td>${fmtMoney(d.net)}</td><td>${d.avg.toFixed(1)}%</td></tr>
            `).join('');

            if ($("#t_taxberg_container")) $("#t_taxberg_container").style.display = tg > 0 ? "block" : "none";
            const realTotal = tg + te;
            const realTax = tt + te;
            if ($("#t_tb_net")) $("#t_tb_net").textContent = fmtMoney(tn);
            if ($("#t_tb_emp_tax")) $("#t_tb_emp_tax").textContent = fmtMoney(tt);
            if ($("#t_tb_err_tax")) $("#t_tb_err_tax").textContent = fmtMoney(te);
            if ($("#t_tb_real_tax")) $("#t_tb_real_tax").textContent = fmtMoney(realTax);
            if ($("#t_tb_real_rate")) $("#t_tb_real_rate").textContent = realTotal > 0 ? (realTax / realTotal * 100).toFixed(1) + "%" : "0%";
        };
    }

    // ---------- Init ----------
    document.addEventListener("DOMContentLoaded", () => {
        const remember = document.getElementById("rememberDevice");
        if (remember) {
            remember.checked = getRememberPref();
            remember.addEventListener("change", () => { setRememberPref(remember.checked); migrateState(remember.checked); saveNow(); });
        }

        initSalaryTax();

        const saved = readState();
        applyStateToForm(saved);
        showTab(saved.activeTab || "growth", false);

        const root = getFormRoot();
        if (root) {
            ["input", "change"].forEach(ev => root.addEventListener(ev, (e) => {
                if (e.target.matches("input, select, textarea")) { saveNow(); calcAll(); }
            }));
        }

        $$("[data-tab]").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
        $("#clearData")?.addEventListener("click", clearAll);
        calcAll();
    });
})();
