# InGen — Visual AWS Architecture Compiler

> Draw your cloud. Validate it instantly. Export production Terraform.

**Live demo → [in-gen-five.vercel.app](https://in-gen-five.vercel.app/)**

---

InGen is a browser-based tool that lets you drag-and-drop AWS serverless components onto a canvas, catch architectural mistakes in real time from a deterministic rules engine, and export production-ready Terraform HCL — all without leaving the browser and without a single API call.

It is not a diagramming tool. It is an **infrastructure compiler with a visual interface**.

## How It Works

```
React Flow Canvas  →  Zustand Store  →  Validation Engine  →  Terraform Compiler  →  HCL Output
```

1. **Draw** — drag AWS components (Lambda, API Gateway, DynamoDB, S3, SQS, SNS, EventBridge, Cognito) onto the canvas and connect them with semantic edges
2. **Validate** — the rules engine runs locally on every change, flagging anti-patterns with badges instantly (no API calls, zero latency)
3. **Export** — click "Export Terraform" and get deployable HCL with IAM roles and policies auto-inferred from your connections

## Why InGen

Cloud infrastructure design has two hard parts: catching mistakes early and translating diagrams into code. Most teams design in Lucidchart, then manually write Terraform from scratch — a slow, error-prone process with permanent drift between the diagram and what's actually deployed.

InGen collapses that gap. The canvas *is* the source of truth. What you draw is what gets deployed.

## Key Features

| Feature | Details |
|---|---|
| **Deterministic Validation** | 6 real-world AWS anti-pattern rules fire on every canvas change — no LLM, no latency, no false positives |
| **IAM Inference** | Draw Lambda → S3 and get `s3:GetObject` / `s3:PutObject` generated automatically |
| **`aws_lambda_permission`** | API Gateway → Lambda edges auto-generate the permission resource that most teams forget |
| **Semantic Edges** | Connections carry auth type and invocation type, powering the rules engine |
| **Undo / Redo** | Full snapshot-based history (Ctrl+Z / Ctrl+Shift+Z), including canvas clear |
| **Zero Backend** | Everything runs client-side — no account, no server, no cold start |

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **ReactFlow 11** — canvas and graph engine
- **Zustand 5** — state management with `persist` middleware (auto-saves to localStorage)
- **Tailwind CSS v4** — PostCSS plugin

## Getting Started

```bash
git clone https://github.com/TahrimWalid/in-gen.git
cd in-gen/frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Roadmap

- **Phase 3** — Claude-powered architecture advisor: a chat sidebar that reads the live diagram JSON and acts as a senior cloud architect
- **Phase 4** — Supabase persistence, user auth, save/load named diagrams
- **V2** — Azure / GCP node palettes, compliance presets (SOC2, HIPAA), cost estimation, IaC round-tripping

## License

MIT
