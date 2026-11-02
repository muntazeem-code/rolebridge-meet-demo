export const supportOptions = [
  { value: "strategy", label: "Business strategy & growth" },
  { value: "finance", label: "Finance & funding" },
  { value: "marketing_sales", label: "Marketing & sales" },
  { value: "operations", label: "Operations & processes" },
  { value: "technology", label: "Technology & digital transformation" },
  { value: "people_hr", label: "People & HR" },
] as const;

export interface CompanyProfile {
  companyName: string;
  description: string;
  supportNeeds: string[];
  companyDetails: string;
  industry?: string;
  website?: string;
  location?: string;
  teamSize?: string;
  foundedYear?: number;
}

interface SubmissionPerson {
  _id: string;
  fullName: string;
  email: string;
}

export interface CompanySubmission extends CompanyProfile {
  _id: string;
  customer: SubmissionPerson | null;
  reviewer: SubmissionPerson | null;
  status: "submitted" | "reviewed";
  reviewerComments?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface CompanySubmissionPage {
  data: CompanySubmission[];
  page: number;
  total: number;
  totalPages: number;
}
