export function DashboardStats({
  totalEnBase,
  matching,
  keywordsCount,
  rubrosCount,
}: {
  totalEnBase: number;
  matching: number;
  keywordsCount: number;
  rubrosCount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "En base de datos", value: totalEnBase.toLocaleString("es-CL") },
        { label: "Coinciden con filtros", value: matching.toLocaleString("es-CL") },
        { label: "Keywords activas", value: String(keywordsCount) },
        { label: "Rubros seleccionados", value: String(rubrosCount) },
      ].map((stat) => (
        <div key={stat.label} className="brand-stat">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </p>
          <p className="font-heading text-2xl font-bold text-[#11233d]">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
