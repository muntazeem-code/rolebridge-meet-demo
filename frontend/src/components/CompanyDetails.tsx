import { supportOptions, type CompanySubmission } from "../types/company";

export default function CompanyDetails({ submission }: { submission: CompanySubmission }) {
  return (
    <div className="company-details">
      <div className="section-heading">
        <h3>{submission.companyName}</h3>
        <span className={`submission-status ${submission.status}`}>
          {submission.status === "reviewed" ? "Reviewed" : "Awaiting review"}
        </span>
      </div>
      <dl className="company-facts">
        {submission.customer && <div><dt>Customer</dt><dd>{submission.customer.fullName}<small>{submission.customer.email}</small></dd></div>}
        <div><dt>Assigned reviewer</dt><dd>{submission.reviewer?.fullName ?? "Reviewer account unavailable"}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(submission.createdAt).toLocaleString()}</dd></div>
        {submission.industry && <div><dt>Industry</dt><dd>{submission.industry}</dd></div>}
        {submission.location && <div><dt>Location</dt><dd>{submission.location}</dd></div>}
        {submission.teamSize && <div><dt>Team size</dt><dd>{submission.teamSize}</dd></div>}
        {submission.foundedYear && <div><dt>Founded</dt><dd>{submission.foundedYear}</dd></div>}
        {submission.website && <div><dt>Website</dt><dd><a href={submission.website} target="_blank" rel="noreferrer">{submission.website}</a></dd></div>}
      </dl>
      <h4>Company description</h4>
      <p className="preserve-text">{submission.description}</p>
      <h4>Support needed</h4>
      <ul className="support-tags">
        {submission.supportNeeds.map((value) => <li key={value}>{supportOptions.find((option) => option.value === value)?.label ?? value}</li>)}
      </ul>
      <h4>Additional company details</h4>
      <p className="preserve-text">{submission.companyDetails}</p>
      {submission.reviewerComments && (
        <div className="review-feedback">
          <h4>Reviewer feedback</h4>
          <p className="preserve-text">{submission.reviewerComments}</p>
          {submission.reviewedAt && <small>Sent {new Date(submission.reviewedAt).toLocaleString()}</small>}
        </div>
      )}
    </div>
  );
}
