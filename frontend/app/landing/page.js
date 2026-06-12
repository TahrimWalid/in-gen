import Link from 'next/link';

const GITHUB_URL = 'https://github.com/TahrimWalid/in-gen';

export const metadata = {
  title: 'InGen — AI-Powered AWS Infrastructure Design',
  description: 'Design AWS architectures, validate in real time, export Terraform. Built for engineers.',
  openGraph: {
    title: 'InGen — Infrastructure Generator',
    description: '32 validation rules. AI generation. Bidirectional Terraform editor.',
  },
};

const PROBLEMS = [
  "You design it in draw.io, build it, then find the security holes in production.",
  "You copy Terraform from Stack Overflow without knowing if it follows best practices.",
  "Your senior engineer reviews the architecture after it's already built.",
];

const STEPS = [
  {
    title: 'Describe or draw your architecture',
    body: "Tell the AI what you're building, or drag components onto the canvas manually.",
  },
  {
    title: 'Get instant validation',
    body: '32 rules check your architecture in real time. Security gaps, misconfigurations, and anti-patterns are flagged immediately — before you write a line of code.',
  },
  {
    title: 'Export Terraform',
    body: 'Your validated architecture becomes production-ready Terraform HCL. Import existing Terraform to visualise and validate your current infrastructure.',
  },
];

const FEATURES = [
  {
    title: 'AI Architecture Generation',
    body: 'Describe your app in plain English. InGen generates a complete AWS serverless architecture using Terraform.',
  },
  {
    title: '32 Validation Rules',
    body: 'Real-time checks for security, reliability, and performance. Catches SQS timeouts, exposed S3 buckets, missing WAF, and more.',
  },
  {
    title: 'Architecture Scoring',
    body: 'Security, Reliability, and Performance scores update as you design. Know your architecture quality before you deploy.',
  },
  {
    title: 'Bidirectional HCL Editor',
    body: 'Edit Terraform directly and watch the diagram update. Edit the diagram and watch the HCL update. Always in sync.',
  },
  {
    title: 'Import Existing Terraform',
    body: 'Paste your existing .tf files to visualise and validate your current infrastructure instantly.',
  },
  {
    title: 'Bring Your Own Model',
    body: 'InGen works with any OpenAI-compatible endpoint. Self-host LLMs (tested on Qwen3.6-27B) for zero API costs and full data sovereignty, or connect Claude, Gemini, or GPT-4o with your own API key.',
  },
];

function HeroCodeBlock() {
  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="absolute -top-6 -right-6 hidden sm:flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5 text-xs font-semibold text-emerald-400 shadow-lg shadow-emerald-500/10">
        32 validation rules · 0 errors
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-purple-950/40 overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10 bg-slate-950/60">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-3 text-xs text-slate-500 font-mono">main.tf</span>
        </div>
        <pre className="p-5 text-[12px] sm:text-sm leading-relaxed font-mono overflow-x-auto">
          <code>
            <span className="text-purple-400">resource</span>{' '}
            <span className="text-emerald-400">&quot;aws_lambda_function&quot;</span>{' '}
            <span className="text-emerald-400">&quot;handler&quot;</span> {'{'}
            {'\n'}  function_name <span className="text-slate-500">=</span> <span className="text-emerald-400">&quot;process-orders&quot;</span>
            {'\n'}  runtime       <span className="text-slate-500">=</span> <span className="text-emerald-400">&quot;nodejs20.x&quot;</span>
            {'\n'}  timeout       <span className="text-slate-500">=</span> <span className="text-amber-400">30</span>
            {'\n'}  memory_size   <span className="text-slate-500">=</span> <span className="text-amber-400">256</span>
            {'\n'}{'}'}
            {'\n\n'}
            <span className="text-purple-400">resource</span>{' '}
            <span className="text-emerald-400">&quot;aws_iam_role_policy&quot;</span>{' '}
            <span className="text-emerald-400">&quot;handler_dynamodb&quot;</span> {'{'}
            {'\n'}  name <span className="text-slate-500">=</span> <span className="text-emerald-400">&quot;process-orders-dynamodb&quot;</span>
            {'\n'}  role <span className="text-slate-500">=</span> aws_iam_role.handler.id
            {'\n\n'}  policy <span className="text-slate-500">=</span> jsonencode({'{'}
            {'\n'}    Statement <span className="text-slate-500">=</span> [{'{'}
            {'\n'}      Effect   <span className="text-slate-500">=</span> <span className="text-emerald-400">&quot;Allow&quot;</span>
            {'\n'}      Action   <span className="text-slate-500">=</span> [<span className="text-emerald-400">&quot;dynamodb:GetItem&quot;</span>, <span className="text-emerald-400">&quot;dynamodb:PutItem&quot;</span>]
            {'\n'}      Resource <span className="text-slate-500">=</span> aws_dynamodb_table.orders.arn
            {'\n'}    {'}'}]
            {'\n'}  {'}'})
            {'\n'}{'}'}
          </code>
        </pre>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        Auto-generated from your diagram — IAM permissions inferred from edges.
      </p>
    </div>
  );
}

function Section({ children, className = '' }) {
  return (
    <section className={`px-6 py-20 sm:py-28 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">
            In<span className="text-purple-400">Gen</span>
          </span>
          <Link
            href="/"
            className="text-sm font-semibold px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors"
          >
            Try it free →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-purple-600/20 rounded-full blur-3xl" />
        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Design AWS Infrastructure.{' '}
              <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                Validate Instantly.
              </span>{' '}
              Export Terraform.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl">
              InGen is an AI-powered infrastructure design tool that catches architectural mistakes before you deploy. Draw your architecture, get real-time validation, and export production-ready Terraform.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                href="/"
                className="text-center text-sm font-semibold px-6 py-3 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/30"
              >
                Try InGen Free →
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-sm font-semibold px-6 py-3 rounded-md border border-white/20 hover:bg-white/5 transition-colors"
              >
                View on GitHub →
              </a>
            </div>
          </div>
          <HeroCodeBlock />
        </div>
      </section>

      {/* Problem */}
      <Section className="border-t border-white/10">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Infrastructure mistakes are expensive
        </h2>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
          {PROBLEMS.map((text) => (
            <p key={text} className="text-slate-400 leading-relaxed text-sm sm:text-base">
              {text}
            </p>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section className="border-t border-white/10 bg-slate-900/40">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Design → Validate → Export
        </h2>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <div className="w-9 h-9 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-400">
                {i + 1}
              </div>
              <h3 className="mt-4 font-semibold text-lg">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section className="border-t border-white/10">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Everything you need to design confidently
        </h2>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-white/10 bg-slate-900/60 p-6 hover:border-purple-500/30 transition-colors"
            >
              <h3 className="font-semibold text-lg">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{feature.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Social proof */}
      <Section className="border-t border-white/10 bg-slate-900/40">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Built for engineers who care about quality
        </h2>
        <blockquote className="mt-10 max-w-2xl mx-auto text-center">
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed">
            &ldquo;InGen catches the kind of mistakes that cost you a Friday night incident response.&rdquo;
          </p>
          <footer className="mt-4 text-sm text-slate-500">— Built by a developer, for developers</footer>
        </blockquote>
      </Section>

      {/* CTA */}
      <Section className="border-t border-white/10 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">
          Start designing better architecture today
        </h2>
        <p className="mt-3 text-slate-400">Free to use. No account required.</p>
        <Link
          href="/"
          className="mt-8 inline-block text-sm sm:text-base font-semibold px-8 py-4 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/30"
        >
          Open InGen →
        </Link>
        <p className="mt-6 text-xs text-slate-500 max-w-md mx-auto">
          Works with Claude, Gemini, GPT-4o, and self-hosted models via any OpenAI-compatible endpoint. Optimized for Qwen3.6-27B.
        </p>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>InGen — Infrastructure Generator</span>
          <div className="flex items-center gap-6">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
              GitHub
            </a>
            <span>Built with Next.js</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
