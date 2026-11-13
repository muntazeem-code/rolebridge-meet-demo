import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, FilePlus2, Sparkles, Building2 } from "lucide-react";
import ProgramApplicationForm from "../components/ProgramApplicationForm";

export default function Home() {
  const [showApplyForm, setShowApplyForm] = useState(false);

  return (
    <main className="py-12 sm:py-16">
      {/* Top Header / Branding */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1 text-xs font-semibold text-indigo-700 mb-4">
          <Sparkles className="size-3.5" />
          Venture Acceleration & Governance
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-3">
          RoleBridge Meet
        </h1>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-600">
          Connect ventures, expert panelists, and partners. Schedule meetings,
          track company reviews, and access automatic meeting transcripts.
        </p>

        {/* Action Buttons on Root Path */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/login"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-all focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <LogIn className="size-4" />
            Login
          </Link>
          <button
            type="button"
            onClick={() => setShowApplyForm((current) => !current)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all"
          >
            <FilePlus2 className="size-4 text-indigo-600" />
            {showApplyForm ? "Hide Application Form" : "Apply to Program"}
          </button>
        </div>
      </div>

      {/* When user clicks "Apply to Program", show the application form right on the root path */}
      {showApplyForm ? (
        <div className="mt-8">
          <ProgramApplicationForm onCancel={() => setShowApplyForm(false)} />
        </div>
      ) : (
        /* Overview Cards */
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-slate-300 transition-colors">
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <LogIn className="size-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Existing Members
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Access your personalized workspace as a Super Admin, VP,
              Panelist, Reviewer, or Customer.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Sign in to your account &rarr;
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-slate-300 transition-colors">
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 className="size-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              New Ventures & Founders
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Directly submit your company profile and support needs. You will
              receive an email invitation to activate your customer account.
            </p>
            <button
              type="button"
              onClick={() => setShowApplyForm(true)}
              className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 bg-transparent border-none p-0 cursor-pointer"
            >
              Start application form &rarr;
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
