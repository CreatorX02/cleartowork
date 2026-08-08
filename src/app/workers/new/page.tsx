import Link from "next/link";
import { addWorker } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900";

export default function NewWorkerPage() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Add worker</h1>
      <form action={addWorker} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input name="fullName" required className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Date of birth</span>
          <input name="dateOfBirth" type="date" required className={inputCls} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input name="email" type="email" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Phone</span>
            <input name="phone" type="tel" className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          At least one of email or phone is needed so we can send check links.
        </p>
        <label className="block">
          <span className="text-sm font-medium">Role</span>
          <input name="roleTitle" required placeholder="e.g. Chef" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Arrangement type</span>
          <select name="arrangementType" required className={inputCls}>
            <option value="employee">Employee (payroll)</option>
            <option value="agency">Agency supplied</option>
            <option value="gig">Gig / platform</option>
            <option value="casual_zero_hours">Casual / zero hours</option>
            <option value="subcontractor">Subcontractor</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Start date</span>
          <input name="startDate" type="date" required className={inputCls} />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700"
        >
          Add worker
        </button>
      </form>
    </main>
  );
}
