# MiroFish — OpenCode Agent Guide

## What you are doing

You are an OpenCode agent inside a Docker container. Your job is to get a **crypto price direction prediction** for the symbol given in your INSTRUCTIONS.md using the MiroFish swarm intelligence backend.

MiroFish runs AI agents that act as traders/analysts on simulated social platforms, lets them debate, and extracts a consensus prediction.

**Do not expose internal IDs, simulation URLs, or MiroFish jargon in your final JSON output.**

---

## Base URL

```
http://mirofish-backend:5001
```

All API calls use this base. Check liveness with `curl -s http://mirofish-backend:5001/health`. If connection refused, the backend is down — return the unavailable JSON immediately (see Output Format).

---

## Step 1 — Check Existing Results (ALWAYS DO THIS FIRST)

```bash
ls /workspace/mirofish-results/crypto/ 2>/dev/null
```

If files exist, read the newest:

```bash
cat $(ls -t /workspace/mirofish-results/crypto/result_*.json 2>/dev/null | head -1)
```

Check the `created_at` field. If **less than 24 hours ago**:

→ **Use the fast path.** Extract `simulation_id` from the file, then run:

```bash
curl -s -X POST http://mirofish-backend:5001/api/report/chat \
  -H "Content-Type: application/json" \
  -d '{
    "simulation_id": "<SIM_ID>",
    "message": "What percentage of agents were bullish vs bearish? Give exact numbers. What is the single price direction signal: bullish, bearish, or neutral? What was the strongest factor driving consensus?"
  }'
```

Extract direction, confidence percentage, and key factor from the response. Then jump straight to **Output Format**.

If no recent result exists → continue to Step 2.

---

## Step 2 — Read Market Data

Read these files from your workspace:
- `data/price.md` — current price, SMA20, SMA50, range
- `data/market.md` — fear & greed, BTC dominance

You'll use this data to write the seed file in Step 3.

---

## Step 3 — Write Seed File

```bash
SYMBOL="<SYMBOL_FROM_INSTRUCTIONS>"  # e.g. BTCUSDT → BTC

cat > /workspace/mirofish_seed.md << 'SEEDEOF'
# <SYMBOL> Price Direction Prediction

## Current Price Data
[Copy the key lines from data/price.md: current price, period change, SMA20, SMA50, range]

## Market Context
[Copy from data/market.md: fear & greed index + label, BTC dominance, market cap change]

## Bull Case
- [3-5 specific reasons price could go up, based on the data]

## Bear Case
- [3-5 specific reasons price could go down, based on the data]

## Prediction Question
Will <SYMBOL> price be bullish, bearish, or neutral over the next 24-72 hours?
SEEDEOF
```

---

## Step 4 — Generate Ontology → get `project_id`

```bash
result=$(curl -s -X POST http://mirofish-backend:5001/api/graph/ontology/generate \
  -F "files=@/workspace/mirofish_seed.md" \
  -F "simulation_requirement=Will <SYMBOL> price be bullish, bearish, or neutral over the next 24-72 hours?" \
  -F "project_name=<SYMBOL>-crypto-prediction" \
  -F "additional_context=Crypto market price direction prediction using technical and sentiment signals.")

project_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['project_id'])")
echo "project_id: $project_id"
```

---

## Step 5 — Build Knowledge Graph → get `graph_id`

```bash
build=$(curl -s -X POST http://mirofish-backend:5001/api/graph/build \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$project_id\", \"graph_name\": \"<SYMBOL>-graph\"}")

task_id=$(echo "$build" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['task_id'])")

for i in $(seq 1 15); do
  sleep 10
  st=$(curl -s http://mirofish-backend:5001/api/graph/task/$task_id | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  echo "[$i] graph: $st"
  if [ "$st" = "completed" ] || [ "$st" = "failed" ]; then break; fi
done

graph_id=$(curl -s http://mirofish-backend:5001/api/graph/task/$task_id | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('graph_id',''))")
echo "graph_id: $graph_id"
```

---

## Step 6 — Create Simulation → get `sim_id`

```bash
sim=$(curl -s -X POST http://mirofish-backend:5001/api/simulation/create \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$project_id\", \"enable_twitter\": true, \"enable_reddit\": true}")

sim_id=$(echo "$sim" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['simulation_id'])")
echo "sim_id: $sim_id"
```

---

## Step 7 — Prepare Simulation (generate agent profiles)

```bash
prep=$(curl -s -X POST http://mirofish-backend:5001/api/simulation/prepare \
  -H "Content-Type: application/json" \
  -d "{\"simulation_id\": \"$sim_id\", \"use_llm_for_profiles\": true, \"parallel_profile_count\": 5}")

prep_task=$(echo "$prep" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['task_id'])")

for i in $(seq 1 40); do
  sleep 10
  st=$(curl -s -X POST http://mirofish-backend:5001/api/simulation/prepare/status \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": \"$prep_task\", \"simulation_id\": \"$sim_id\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('status','?'))")
  echo "[$i] prepare: $st"
  if [ "$st" = "completed" ] || [ "$st" = "failed" ] || [ "$st" = "ready" ]; then break; fi
done
```

---

## Step 8 — Run Simulation (25 rounds)

```bash
curl -s -X POST http://mirofish-backend:5001/api/simulation/start \
  -H "Content-Type: application/json" \
  -d "{\"simulation_id\": \"$sim_id\", \"platform\": \"parallel\", \"max_rounds\": 25, \"enable_graph_memory_update\": true}"

for i in $(seq 1 60); do
  sleep 15
  r=$(curl -s http://mirofish-backend:5001/api/simulation/$sim_id/run-status)
  st=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('runner_status','?'))")
  rnd=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('current_round',0))")
  echo "[$i] sim: $st round $rnd/25"
  if [ "$st" = "completed" ] || [ "$st" = "failed" ] || [ "$st" = "stopped" ]; then break; fi
done
```

---

## Step 9 — Generate Report → get `report_id`

```bash
rpt=$(curl -s -X POST http://mirofish-backend:5001/api/report/generate \
  -H "Content-Type: application/json" \
  -d "{\"simulation_id\": \"$sim_id\"}")

report_id=$(echo "$rpt" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['report_id'])")
rpt_task=$(echo "$rpt" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['task_id'])")

for i in $(seq 1 40); do
  sleep 15
  st=$(curl -s -X POST http://mirofish-backend:5001/api/report/generate/status \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": \"$rpt_task\", \"simulation_id\": \"$sim_id\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('status','?'))")
  echo "[$i] report: $st"
  if [ "$st" = "completed" ] || [ "$st" = "failed" ]; then break; fi
done
```

---

## Step 10 — Extract the Prediction

Ask two targeted questions:

```bash
# Question 1: direction and breakdown
curl -s -X POST http://mirofish-backend:5001/api/report/chat \
  -H "Content-Type: application/json" \
  -d "{\"simulation_id\": \"$sim_id\", \"message\": \"What percentage of agents were bullish vs bearish? Give exact numbers. What is the price direction signal: bullish, bearish, or neutral? What was the single strongest factor driving the consensus?\"}"

# Question 2: confidence score
curl -s -X POST http://mirofish-backend:5001/api/report/chat \
  -H "Content-Type: application/json" \
  -d "{\"simulation_id\": \"$sim_id\", \"message\": \"Give me one number: confidence percentage for the price direction prediction (0-100). No ranges, no hedging.\"}"
```

---

## Step 11 — Save Result

```bash
mkdir -p /workspace/mirofish-results/crypto

N=$(ls /workspace/mirofish-results/crypto/result_*.json 2>/dev/null | wc -l)
N=$((N + 1))
HASH=$(echo -n "${sim_id}" | md5sum | cut -c1-8)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPIRES=$(date -u -d "+24 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+24H +"%Y-%m-%dT%H:%M:%SZ")
```

Write `/workspace/mirofish-results/crypto/result_${N}_${HASH}.json`:

```json
{
  "id": "result_<N>_<HASH>",
  "category": "crypto",
  "created_at": "<NOW>",
  "prediction_question": "Will <SYMBOL> be bullish/bearish/neutral over 24-72h?",
  "simulation_id": "<sim_id>",
  "report_id": "<report_id>",
  "project_id": "<project_id>",
  "agents_count": 9,
  "rounds": 25,
  "prediction": {
    "direction": "bullish|bearish|neutral",
    "confidence_pct": 70,
    "key_factors": ["Factor 1", "Factor 2", "Factor 3"]
  },
  "referenceable": true,
  "expires_at": "<EXPIRES>"
}
```

---

## Output Format

After the workflow is done, respond with **ONLY** this JSON — no markdown, no explanation, nothing else:

```json
{
  "direction": "long",
  "confidence": 0.70,
  "reason": "Crowd consensus of 68% bullish agents driven by [key factor]. [One more sentence max.]",
  "indicators": {
    "consensus_bull_pct": 68,
    "consensus_bear_pct": 32,
    "simulation_rounds": 25,
    "agents_count": 9
  }
}
```

**Rules:**
- `direction`: `"long"` = bullish, `"short"` = bearish, `"neutral"` = genuinely split
- `confidence`: decimal 0.0–1.0 (68% consensus → 0.68). Typical range: 0.45–0.80
- `reason`: 1–3 sentences MAX. No localhost URLs. No simulation_id/report_id/project_id. No "MiroFish" jargon.
- `indicators`: only percentages and counts. Never expose internal IDs.
- Backend down → `{"direction":"neutral","confidence":0.1,"reason":"Mirofish backend unavailable","indicators":{}}`
- Be decisive — only `"neutral"` when the consensus split is genuinely close to 50/50
