import Link from "next/link";

export default function LeadTable({ leads }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left border-b">
        <th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Status</th>
      </tr></thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className="py-2"><Link className="underline" href={`/leads/${l.id}`}>{l.firstName} {l.lastName}</Link></td>
            <td>{l.title}</td>
            <td>{l.company}</td>
            <td>{l.email}</td>
            <td>{l.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
