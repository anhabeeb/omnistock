export const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-8">
    <div className="h-12 bg-slate-900 rounded-xl w-1/3" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-900 rounded-3xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 h-96 bg-slate-900 rounded-3xl" />
      <div className="h-96 bg-slate-900 rounded-3xl" />
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="animate-pulse space-y-4">
    <div className="h-10 bg-slate-900 rounded-xl w-full" />
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="h-16 bg-slate-900/50 rounded-xl w-full" />
    ))}
  </div>
);
