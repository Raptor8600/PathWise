/**
 * Pathwise — Fresh script.js (copy/paste)
 * - Tabs: Compound Growth + Debt Payoff
 * - "Remember on this device" toggle:
 *    OFF => sessionStorage (clears when tab closes)
 *    ON  => localStorage (persists)
 * - Clear button wipes both
 *
 * REQUIRED HTML element IDs:
 * Toggle:        #rememberDevice
 * Clear button:  #clearData
 * Tabs buttons:  [data-tab="growth"], [data-tab="debt"]
 * Sections:      #tab-growth, #tab-debt
 *
 * Growth inputs: #g_start, #g_monthly, #g_rate, #g_years
 * Growth outputs:#g_final, #g_contrib, #g_interest, #g_months, #g_avg_interest
 *
 * Debt inputs:   #d_balance, #d_apr, #d_payment, #d_extra
 * Debt outputs:  #d_time, #d_total_paid, #d_total_interest, #d_warn
 * Created by Raptor8600
 */

(() => {
    "use strict";

    const STORAGE_KEY = "pathwise_form_state_v1";
    const PREF_KEY = "pathwise_remember_device_v1";
    const FORM_ROOT_ID = "pathwise-form";

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

        // Only fields inside #pathwise-form are persisted.
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
    };

    const saveNow = () => writeState(captureFormToState());

    // ---------- Tabs ----------
    const BLURBS = {
        growth: "Compound interest is 'interest on interest.' Start of Month means you invest before the bank calculates growth, maximizing your earnings immediately. End of Month means you invest after, so that specific payment starts earning next month. Over 20 years, that 'head start' can add thousands to your total.",
        debt: "Paying off debt isn't just about the balance; it's about the interest. By paying more than the minimum, you directly reduce the principal that interest is calculated on, saving months or years of payments.",
        utilization: "Your credit score is a 'risk' grade. While utilization is a huge 30%, payment history is even bigger (35%). Keeping balances low and accounts old shows lenders you are reliable over the long term.",
        loan: "Amortization is the process of paying off debt in regular installments. Early on, most of your payment goes to interest. As the balance drops, more goes toward the principal. This is why car and home loans start slow!",
        goal: "Reaching a goal requires a balance of time and contributions. High-yield accounts help, but consistency (the 'monthly' amount) is usually the biggest driver for short-term goals under 5 years.",
        inflation: "Inflation is the 'hidden tax' that erodes purchasing power. $1,000 today might only buy $700 worth of goods in a decades' time. This is why investing is crucial—to outpace the rising cost of living."
    };

    const showTab = (name, save = true) => {
        if (!name) name = "growth";
        // Toggle sections
        $$("section.card[id^='tab-']").forEach((sec) => {
            sec.style.display = sec.id === `tab-${name}` ? "block" : "none";
        });
        // Toggle buttons
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

    // Global chart instances
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
                // Determine what balance earns interest this month
                // Industry standard: Start of month includes current deposit in that month's interest share
                const earningBase = (timing === "start") ? (bal + monthly) : bal;

                if (timing === "start") {
                    bal += monthly;
                    meta.contributed += monthly;
                    // For annual frequencies, we include this boundary deposit in the base
                    if (m % monthsPerPeriod === 0) compoundingBase = bal;
                }

                if (compoundFreq >= 12) {
                    // Monthly/Daily
                    const effMonthly = Math.pow(1 + r / compoundFreq, compoundFreq / 12) - 1;
                    const intNow = earningBase * effMonthly;
                    bal += intNow;
                    meta.interest += intNow;
                } else if ((m + 1) % monthsPerPeriod === 0 || m === months - 1) {
                    // The 'earningBase' logic applies strictly to sub-monthly too 
                    // if we define it as 'Beginning of Period balance'
                    const intNow = compoundingBase * (r / compoundFreq);
                    bal += intNow;
                    meta.interest += intNow;
                    compoundingBase = bal;
                }

                if (timing === "end") {
                    bal += monthly;
                    meta.contributed += monthly;
                }

                // Update boundary base for next cycle
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

        // Ensure instance is completely cleaned up
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        const datasets = [];
        if (zeroHist) {
            datasets.push({
                label: `0% Interest`,
                data: zeroHist,
                borderColor: '#64748b',
                borderDash: [5, 5],
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (highHist) {
            datasets.push({
                label: `High (${(rate + varPct).toFixed(1)}%)`,
                data: highHist,
                borderColor: '#4ade80',
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 6,
                pointHitRadius: 10,
                tension: 0.3,
                spanGaps: true
            });
        }
        datasets.push({
            label: `Base (${rate.toFixed(1)}%)`,
            data: baseHist,
            borderColor: '#B59B6A',
            backgroundColor: 'rgba(181, 155, 106, 0.1)',
            fill: true,
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 8,
            spanGaps: true
        });
        if (lowHist) {
            datasets.push({
                label: `Low (${(rate - varPct).toFixed(1)}%)`,
                data: lowHist,
                borderColor: '#f87171',
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 6,
                pointHitRadius: 10,
                tension: 0.3,
                spanGaps: true
            });
        }

        new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                    axis: 'x'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(11, 20, 32, 0.95)',
                        titleColor: '#B59B6A',
                        bodyColor: '#E6EDF5',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || '';
                                const val = context.raw;
                                if (val === null || val === undefined) return label;

                                let out = label + ': ' + fmtMoney(val);

                                try {
                                    const datasets = context.chart.data.datasets;
                                    const baseDs = datasets?.find(d => d.label?.includes('Base'));
                                    if (baseDs && context.dataset !== baseDs) {
                                        const baseVal = baseDs.data[context.dataIndex];
                                        if (baseVal !== undefined) {
                                            const diff = val - baseVal;
                                            if (Math.abs(diff) > 0.01) {
                                                const sign = diff > 0 ? '+' : '';
                                                out += ' (' + sign + fmtMoney(diff) + ')';
                                            }
                                        }
                                    }
                                } catch (e) { }
                                return out;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#94a3b8',
                            autoSkip: true,
                            maxRotation: 0,
                            callback: function (value) {
                                if (Math.abs(value) >= 1000) {
                                    return '$' + (value / 1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
                                }
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
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
        const MAX_MONTHS = 1200;

        while (balance > 0.005 && months < MAX_MONTHS) {
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
        let advice = "Keep building your history!";

        // 1. Utilization (30 points)
        const rate = limit > 0 ? (balance / limit) * 100 : 0;
        if (limit > 0) {
            if (rate < 10) score += 30;
            else if (rate < 30) score += 25;
            else if (rate < 50) score += 15;
            else if (rate < 70) score += 5;
        }

        // 2. Payment History (35 points) - LATE PAYMENTS
        if (late === 0) score += 35;
        else if (late === 1) score += 15;
        else if (late === 2) score += 5;

        // 3. Age (15 points)
        if (age >= 7) score += 15;
        else if (age >= 5) score += 12;
        else if (age >= 3) score += 8;
        else if (age >= 1) score += 4;

        // 4. Inquiries (10 points)
        if (inquiries === 0) score += 10;
        else if (inquiries === 1) score += 8;
        else if (inquiries === 2) score += 5;
        else if (inquiries === 3) score += 2;

        // 5. Total Accounts (10 points)
        if (totalAcc >= 6) score += 10;
        else if (totalAcc >= 4) score += 8;
        else if (totalAcc >= 2) score += 5;
        else if (totalAcc >= 1) score += 2;

        // Determine Grade & Advice
        let grade = "Very Poor (F)";
        if (score >= 90) { grade = "Excellent (A)"; advice = "Excellent! Maintain low balances."; }
        else if (score >= 80) { grade = "Good (B)"; advice = "Good health. Aim for < 10% utilization."; }
        else if (score >= 70) { grade = "Fair (C)"; advice = "Fair. Reduce balances and avoid new inquiries."; }
        else if (score >= 60) { grade = "Poor (D)"; advice = "Poor. Focus on on-time payments and paying down debt."; }
        else { advice = "Focus on rebuilding. Pay off balances and avoid late payments at all costs."; }

        // Specific urgent advice priorities
        if (late > 0) advice = "Priority: Ensure all future payments are on time.";
        else if (rate > 50) advice = "Priority: Pay down high balances (Utilization is high).";
        else if (inquiries > 3) advice = "Priority: Stop applying for new credit for 6-12 months.";

        if ($("#u_rate")) $("#u_rate").textContent = rate.toFixed(1) + "%";
        if ($("#u_zone")) $("#u_zone").textContent = grade;
        if ($("#u_goal")) $("#u_goal").textContent = advice;
    };

    const calcLoan = () => {
        const p = parseNum($("#l_amount")?.value);
        const apr = parseNum($("#l_apr")?.value);
        const termInput = parseNum($("#l_term")?.value);
        const unit = $("#l_unit")?.value || "years";
        const n = unit === "years" ? termInput * 12 : termInput;
        const r = (apr / 100) / 12;

        if (p <= 0 || n <= 0) return;

        let monthly;
        if (r === 0) monthly = p / n;
        else monthly = p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

        const totalCost = monthly * n;
        const totalInt = totalCost - p;

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
            // Precise simulation to find required payment
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

                    if (timing === "end") {
                        testBal += mid;
                    }

                    if ((m + 1) % mPerComp === 0) {
                        cBase = testBal;
                    }
                }
                if (testBal < target) low = mid;
                else high = mid;
            }
            monthlyNeeded = high;
        }

        $("#s_monthly_needed").textContent = fmtMoney(monthlyNeeded);
        $("#s_out_time").textContent = years;
        $("#s_out_goal").textContent = fmtMoney(target);
        $("#s_result_container").style.display = "block";

        // Final simulation for chart
        let bal = start;
        let cBase = start;
        let contributed = 0;
        let interest = 0;
        const histTotal = [start];
        const histContrib = [0];
        const histBase = [start];
        const labels = ["Start"];
        const mPerComp = 12 / freq;

        for (let m = 0; m < months; m++) {
            const earnsThisMonth = (timing === "start") ? (bal + monthlyNeeded) : bal;

            if (timing === "start") {
                bal += monthlyNeeded;
                contributed += monthlyNeeded;
                if (m % mPerComp === 0) cBase = bal;
            }

            if ((m + 1) % mPerComp === 0 || m === months - 1) {
                const i = (freq >= 12)
                    ? (earnsThisMonth * (Math.pow(1 + r / freq, freq / 12) - 1))
                    : (cBase * (r / freq));
                bal += i;
                interest += i;
            }

            if (timing === "end") {
                bal += monthlyNeeded;
                contributed += monthlyNeeded;
            }

            if ((m + 1) % mPerComp === 0) {
                cBase = bal;
            }

            if ((m + 1) % 12 === 0 || m === months - 1) {
                histTotal.push(bal);
                histContrib.push(contributed);
                // Initial investment line (no additions)
                const bVal = start * Math.pow(1 + r / freq, Math.ceil((m + 1) * freq / 12));
                histBase.push(bVal);
                labels.push(`Yr ${Math.floor((m + 1) / 12)}`);
            }
        }

        $("#s_contrib").textContent = fmtMoney(contributed);
        $("#s_interest").textContent = fmtMoney(interest);

        renderGoalChart(labels, histTotal, histContrib, histBase);
    };

    const renderGoalChart = (labels, total, contrib, base) => {
        const ctx = $("#s_chart")?.getContext("2d");
        if (!ctx) return;
        if (sChartInstance) sChartInstance.destroy();

        sChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Total Savings",
                        data: total,
                        borderColor: "#10b981",
                        backgroundColor: "rgba(16,185,129,0.1)",
                        borderWidth: 3,
                        pointRadius: 4,
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: "Monthly Additions",
                        data: contrib,
                        borderColor: "#f43f5e",
                        borderWidth: 2,
                        pointRadius: 4,
                        tension: 0.3
                    },
                    {
                        label: "Initial Investment",
                        data: base,
                        borderColor: "#3b82f6",
                        borderWidth: 2,
                        pointRadius: 4,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { color: "#94a3b8" } },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            color: "#94a3b8",
                            callback: (v) => {
                                if (Math.abs(v) >= 1000) {
                                    return '$' + (v / 1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
                                }
                                return "$" + v.toLocaleString();
                            }
                        },
                        grid: { color: "rgba(255,255,255,0.05)" }
                    },
                    x: {
                        ticks: { color: "#94a3b8" },
                        grid: { display: false }
                    }
                }
            }
        });
    };

    const calcInflation = () => {
        const amount = parseNum($("#i_amount")?.value);
        const ratePct = parseNum($("#i_rate")?.value);
        const timeInput = parseNum($("#i_time")?.value);
        const unit = $("#i_unit")?.value || "years";
        const n = unit === "years" ? timeInput : timeInput / 12;
        const r = ratePct / 100;

        const futureCost = amount * Math.pow(1 + r, n);
        const todayValue = amount / Math.pow(1 + r, n);
        const loss = ((amount - todayValue) / amount) * 100;

        if ($("#i_future")) $("#i_future").textContent = fmtMoney(futureCost);
        if ($("#i_today")) $("#i_today").textContent = fmtMoney(todayValue);
        if ($("#i_loss")) $("#i_loss").textContent = amount > 0 ? loss.toFixed(1) + "%" : "0%";
    };

    const clearAll = () => {
        if (!confirm("Are you sure? This will delete all saved data and reset all tools to zero.")) return;

        // 1. Wipe all possible storage
        localStorage.clear();
        sessionStorage.clear();

        // 2. Manually clear UI elements before reload
        const inputs = document.querySelectorAll("input, select, textarea");
        inputs.forEach(el => {
            if (el instanceof HTMLInputElement) {
                if (el.type === "checkbox" || el.type === "radio") el.checked = false;
                else el.value = "";
            } else if (el instanceof HTMLSelectElement) {
                el.selectedIndex = 0;
            }
        });

        // 3. Clear output labels
        $$(".outputs span").forEach(s => s.textContent = s.id.includes("rate") || s.id.includes("loss") || s.id.includes("zone") || s.id.includes("time") || s.id.includes("goal") ? "—" : "$0");

        // 4. Force a hard, cache-busting reload
        window.location.href = window.location.origin + window.location.pathname + "?reset=" + Date.now();
    };

    const calcAll = () => {
        calcGrowth(); calcDebt(); calcUtilization(); calcLoan(); calcGoal(); calcInflation();
    };

    // ---------- Init ----------
    document.addEventListener("DOMContentLoaded", () => {
        const remember = document.getElementById("rememberDevice");
        if (remember) {
            remember.checked = getRememberPref();
            remember.addEventListener("change", () => {
                const enabled = remember.checked;
                setRememberPref(enabled);
                migrateState(enabled);
                saveNow();
            });
        }

        const savedState = readState();
        applyStateToForm(savedState);
        showTab(savedState.activeTab || "growth", false);

        const root = getFormRoot();
        if (root) {
            root.addEventListener("input", (e) => {
                const t = e.target;
                if (t && (t.matches?.("input, select, textarea"))) {
                    saveNow();
                    calcAll(); // Reactive calculation
                }
            });
            root.addEventListener("change", (e) => {
                const t = e.target;
                if (t && (t.matches?.("input, select, textarea"))) {
                    saveNow();
                    calcAll(); // Reactive calculation
                }
            });
        }

        $$("[data-tab]").forEach((btn) => {
            btn.addEventListener("click", () => showTab(btn.dataset.tab));
        });

        $("#g_calc")?.addEventListener("click", () => { calcGrowth(); saveNow(); });
        $("#d_calc")?.addEventListener("click", () => { calcDebt(); saveNow(); });
        $("#u_calc")?.addEventListener("click", () => { calcUtilization(); saveNow(); });
        $("#l_calc")?.addEventListener("click", () => { calcLoan(); saveNow(); });
        $("#s_calc")?.addEventListener("click", () => { calcGoal(); saveNow(); });
        $("#i_calc")?.addEventListener("click", () => { calcInflation(); saveNow(); });

        $("#clearData")?.addEventListener("click", clearAll);

        $("#g_toggle_table")?.addEventListener("click", () => {
            const container = $("#g_table_container");
            const btn = $("#g_toggle_table");
            if (container && btn) {
                const isHidden = container.style.display === "none";
                container.style.display = isHidden ? "block" : "none";
                btn.textContent = isHidden ? "Hide Table" : "Show Table";
            }
        });

        calcAll();
    });
})();