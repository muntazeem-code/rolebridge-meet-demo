import { Link, useNavigate } from "react-router-dom";
import ProgramApplicationForm from "../components/ProgramApplicationForm";

export default function ApplyProgram() {
  const navigate = useNavigate();

  return (
    <main className="py-8">
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between px-2">
        <Link to="/" className="text-xs font-medium text-slate-500 hover:text-indigo-600">
          &larr; Back to Home
        </Link>
        <span className="text-xs text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-800">
            Sign In
          </Link>
        </span>
      </div>
      <ProgramApplicationForm onCancel={() => navigate("/")} />
    </main>
  );
}
