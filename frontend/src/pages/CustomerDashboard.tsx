import CustomerCompanyForm from "../components/CustomerCompanyForm";
import MeetingList from "../components/MeetingList";

export default function CustomerDashboard() {
  return (
    <>
      <h1>Customer dashboard</h1>
      <CustomerCompanyForm />
      <MeetingList scope="customer" />
    </>
  );
}
