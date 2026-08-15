function Bar({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-ash/60 ${className}`} />;
}

export function RouteSkeleton() {
  return (
    <div className="min-h-[65vh] max-w-7xl mx-auto px-6 lg:px-8 py-12" aria-busy="true" aria-label="Loading">
      <Bar className="h-3 w-28 mb-8" />
      <Bar className="h-10 w-full max-w-md mb-4" />
      <Bar className="h-4 w-full max-w-2xl" />
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="bg-clinical min-h-screen" aria-busy="true" aria-label="Loading product">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <Bar className="h-3 w-36 mb-8" />
        <div className="grid lg:grid-cols-2 gap-12">
          <Bar className="aspect-square w-full rounded-2xl" />
          <div className="pt-2">
            <Bar className="h-3 w-44 mb-5" />
            <Bar className="h-12 w-3/4 mb-6" />
            <Bar className="h-4 w-full mb-3" />
            <Bar className="h-4 w-5/6 mb-10" />
            <div className="grid grid-cols-3 gap-px bg-ash mb-8">
              {Array.from({ length: 6 }).map((_, index) => <Bar key={index} className="h-20 rounded-none bg-white" />)}
            </div>
            <Bar className="h-10 w-32 mb-6" />
            <Bar className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-clinical px-6 py-12" aria-busy="true" aria-label="Loading dashboard">
      <div className="max-w-6xl mx-auto">
        <Bar className="h-3 w-32 mb-4" />
        <Bar className="h-10 w-72 mb-10" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, index) => <Bar key={index} className="h-28" />)}
        </div>
        <Bar className="h-72 w-full" />
      </div>
    </div>
  );
}