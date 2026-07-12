interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <section className="border-2 border-line bg-surface px-5 py-5 text-base leading-7">
        <h2 className="text-2xl font-bold uppercase">{title}</h2>
        <p className="mt-4">{description}</p>
      </section>
    </section>
  );
}
