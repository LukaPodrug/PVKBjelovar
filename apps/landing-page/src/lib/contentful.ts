export interface NewsItem {
  id: string;
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
  content: string[];
  publishedAt: string;
  ctaLabel: string;
  imageUrl: string | null;
}

export interface NewsFeedResult {
  isFallback: boolean;
  items: NewsItem[];
}

interface ContentfulEntry {
  fields?: Record<string, unknown>;
  sys?: {
    createdAt?: string;
    id?: string;
  };
}

interface ContentfulAsset {
  fields?: {
    file?: {
      url?: string;
    };
  };
  sys?: {
    id?: string;
  };
}

function createNewsSlug(title: string, id: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || id;
}

const fallbackArticleImages = [
  "/gallery/junior-sprint.svg",
  "/gallery/goal-mouth.svg",
  "/gallery/deck-huddle.svg",
  "/gallery/training-grid.svg",
];

const fallbackNewsDefinitions = [
  {
    eyebrow: "Obavijesti kluba",
    title: "Ljetni upisi za nove mlađe članove i dalje su otvoreni",
    summary:
      "Prijave roditelja otvorene su za novi razvojni ciklus, a uvodni ogledni treninzi održat će se tijekom prvog tjedna.",
    content: [
      "Ljetni ciklus upisa za nove članove PVK Mladost Bjelovar otvoren je za djecu koja žele napraviti prve korake u plivanju i vaterpolu kroz strukturiran uvodni program.",
      "Roditelji putem javnog obrasca mogu poslati osnovne podatke, a klub zatim organizira prvi kontakt, predlaže odgovarajuću kategoriju i dogovara probni dolazak na trening.",
      "Uvodni termini tijekom prvog tjedna osmišljeni su tako da djeca upoznaju bazen, trenere i ritam rada, dok roditelji dobivaju jasan pregled organizacije, komunikacije i daljnjih koraka.",
      "Naglasak ostaje na sigurnom ulasku u sustav rada kluba, jasnoj komunikaciji s obiteljima i kvalitetnom usmjeravanju novih članova prema skupini koja najbolje odgovara njihovoj dobi i razini iskustva.",
    ],
    publishedAt: "2026-06-18T10:00:00.000Z",
    ctaLabel: "Prijavite se danas",
  },
  {
    eyebrow: "Natjecanja",
    title: "Seniorska ekipa potvrđuje vikend blok pripremnih utakmica",
    summary:
      "Treninzi pripreme za utakmicu održat će se prema planu, uz dodatnu taktičku analizu u petak prije subotnjeg programa.",
    content: [
      "Seniorska ekipa ulazi u vikend blok pripremnih utakmica s jasno definiranim rasporedom rada i dodatnim fokusom na taktičke detalje uoči natjecateljskog dijela programa.",
      "Petak je rezerviran za završnu video-analizu i korekcije ključnih situacija u obrani i tranziciji, dok će subotnji termini biti usmjereni na provjeru ritma i širine rotacije.",
      "Stručni stožer koristi ovaj blok kako bi uskladio rad različitih linija momčadi i provjerio kako igrači reagiraju u uvjetima sličnim utakmici.",
      "Cilj pripremnih susreta nije samo rezultat, nego i stabilna izvedba, komunikacija u bazenu te fizička i mentalna priprema ekipe za nastavak sezone.",
    ],
    publishedAt: "2026-06-14T09:00:00.000Z",
    ctaLabel: "Pogledajte raspored",
  },
  {
    eyebrow: "Zajednica",
    title: "Susret za nove roditelje počinje prije treninga",
    summary:
      "Nove obitelji mogu upoznati trenere, pregledati strukturu kategorija i riješiti osnovna pitanja prije prvog ulaska u bazen.",
    content: [
      "Prije sljedećeg uvodnog treninga klub organizira kratki susret za nove roditelje kako bi sve obitelji dobile jednake informacije prije prvog ulaska djeteta u bazen.",
      "Na susretu će treneri predstaviti način rada po kategorijama, očekivanu dinamiku treninga, osnovna pravila komunikacije i organizaciju dolazaka.",
      "Roditelji će moći postaviti pitanja o opremi, članstvu, rasporedu i procesu upisa, a administrativni dio prijave moći će se potvrditi odmah nakon sastanka.",
      "Ovakav format pomaže obiteljima da se od početka osjećaju uključeno, informirano i sigurno u odluci da dijete uključe u rad kluba.",
    ],
    publishedAt: "2026-06-09T15:30:00.000Z",
    ctaLabel: "Isplanirajte dolazak",
  },
  {
    eyebrow: "Mlađe kategorije",
    title: "U12 skupina zaključila je tjedan mini turnirom i tehničkim testiranjem",
    summary:
      "Tjedni blok završio je internim susretima i kratkom procjenom tehničkog napretka svakog igrača u skupini.",
    content: [
      "U12 skupina zatvorila je radni tjedan mini turnirom kroz koji su treneri mogli procijeniti prijenos tehničkih zadataka u stvarne situacije igre.",
      "Osim kratkih utakmica, odrađen je i tehnički blok s fokusom na rad nogu, prijem lopte i organizaciju kretanja bez lopte.",
      "Roditelji su nakon treninga dobili kratke informacije o naglascima u radu, a treneri su označili individualne ciljeve za iduća dva tjedna.",
    ],
    publishedAt: "2026-06-07T11:15:00.000Z",
    ctaLabel: "Pročitajte više",
  },
  {
    eyebrow: "Raspored",
    title: "Objavljen je okvirni plan probnih treninga za srpanj",
    summary:
      "Otvoreni termini tijekom srpnja raspoređeni su po dobnim skupinama kako bi nove obitelji lakše organizirale prvi dolazak.",
    content: [
      "Klub je objavio okvirni raspored probnih treninga za srpanj s ciljem da nove obitelji unaprijed vide raspoložive termine za prvi dolazak.",
      "Raspored ostaje dovoljno fleksibilan za prilagodbu godišnjim odmorima i putovanjima, ali osnovna struktura omogućuje ravnomjernu raspodjelu dolazaka po skupinama.",
      "Administracija kluba prati broj prijava po terminu kako bi se svako dijete uključilo u optimalnu skupinu bez preopterećenja bazena i stručnog kadra.",
    ],
    publishedAt: "2026-06-04T08:20:00.000Z",
    ctaLabel: "Otvorite plan",
  },
  {
    eyebrow: "Kondicija",
    title: "Kondicijski blok za U16 i seniore ulazi u novu fazu rada",
    summary:
      "Naglasak u idućem mikro ciklusu bit će na snazi trupa, mobilnosti ramena i stabilnosti pri promjeni smjera.",
    content: [
      "Stručni stožer proširuje kondicijski blok za U16 i seniorsku skupinu kako bi fizička priprema bolje pratila zahtjeve rada u vodi.",
      "Nova faza rada uključuje više ciljanih vježbi za mobilnost, kontrolu opterećenja i prevenciju prenaprezanja tijekom zgusnutog rasporeda.",
      "Praćenje oporavka i individualnih ograničenja ostaje obavezni dio procesa, posebno kod igrača koji paralelno rade i dodatne bazenske sadržaje.",
    ],
    publishedAt: "2026-06-01T17:45:00.000Z",
    ctaLabel: "Saznajte detalje",
  },
  {
    eyebrow: "Klub",
    title: "Najavljen je domaći turnir u Bjelovaru za mlađe uzraste",
    summary:
      "Klub priprema vikend program s gostujućim ekipama, rasporedom utakmica i organiziranim roditeljskim dežurstvima.",
    content: [
      "PVK Mladost Bjelovar priprema domaći turnir za mlađe uzraste kao važan organizacijski i natjecateljski događaj početkom ljeta.",
      "Osim utakmica, turnir će uključivati jasne protokole dolaska, rasporede svlačionica i roditeljska dežurstva kako bi cijeli vikend protekao uredno i sigurno.",
      "Za mlađe igrače ovakav događaj predstavlja vrijednu priliku za iskustvo natjecanja, dok klub dodatno jača suradnju s obiteljima i lokalnom zajednicom.",
    ],
    publishedAt: "2026-05-28T13:10:00.000Z",
    ctaLabel: "Pogledajte najavu",
  },
  {
    eyebrow: "Razvoj igrača",
    title: "Polaznici škole plivanja prelaze u natjecateljske skupine",
    summary:
      "Nakon završne procjene dio djece iz škole plivanja ulazi u strukturiraniji ritam rada unutar mlađih vaterpolskih kategorija.",
    content: [
      "Nakon završne procjene tehnike i samostalnosti u vodi, dio polaznika škole plivanja spreman je za prijelaz u mlađe natjecateljske skupine.",
      "Prijelazni period provodi se postupno kako bi djeca, treneri i roditelji imali dovoljno vremena za prilagodbu novom rasporedu i obvezama.",
      "Klub zadržava individualni pristup tijekom prvih tjedana kako bi svakom djetetu olakšao prelazak iz osnovnog plivačkog programa u zahtjevniji timski rad.",
    ],
    publishedAt: "2026-05-23T09:40:00.000Z",
    ctaLabel: "Saznajte više",
  },
  {
    eyebrow: "Roditelji",
    title: "Roditeljska logistika za turnire i gostovanja dobiva novu organizaciju",
    summary:
      "Uvodi se jasniji raspored prijava za prijevoz, dežurstva i komunikaciju kako bi priprema odlazaka bila preglednija.",
    content: [
      "Klub uvodi pregledniji model organizacije roditeljske logistike za turnire, utakmice i zajednička gostovanja mlađih kategorija.",
      "Nova organizacija oslanja se na unaprijed pripremljene liste prijava i točne vremenske rokove za potvrdu dolaska, prijevoza i dodatne pomoći na događajima.",
      "Cilj promjene je smanjiti ad hoc dogovore i olakšati trenerima i roditeljima koordinaciju oko svakog većeg klupskog izlaska.",
    ],
    publishedAt: "2026-05-18T16:25:00.000Z",
    ctaLabel: "Pročitajte objavu",
  },
  {
    eyebrow: "Natjecanja",
    title: "U14 ekipa otvara pripremni ciklus dvjema kontrolnim utakmicama",
    summary:
      "Dva kratka susreta poslužit će za provjeru obrambenih rotacija, discipline povratka i širine rostera.",
    content: [
      "U14 momčad ulazi u pripremni ciklus kroz dvije kontrolne utakmice koje će trenerima dati bolji pregled natjecateljske forme i širine rostera.",
      "Poseban fokus ostaje na obrambenim rotacijama, komunikaciji nakon izgubljene lopte i pravovremenom povratku u vlastitu polovicu bazena.",
      "Rezultat susreta bit će manje važan od kvalitete izvedbe i sposobnosti skupine da održi dogovoreni ritam igre kroz cijeli blok rada.",
    ],
    publishedAt: "2026-05-12T10:30:00.000Z",
    ctaLabel: "Pogledajte plan",
  },
  {
    eyebrow: "Zajednica",
    title: "Klupsko druženje na bazenu okuplja igrače, roditelje i trenere",
    summary:
      "Završetak školskog dijela sezone obilježit će neformalno druženje s kratkim programom za sve generacije kluba.",
    content: [
      "Na kraju školskog dijela sezone klub organizira neformalno druženje na bazenu s ciljem da se igrači, roditelji i treneri okupe i izvan standardnog trenažnog ritma.",
      "Program uključuje kratke pokazne sadržaje mlađih skupina, zajedničko fotografiranje i prostor za razgovor o planovima za ljetne mjesece.",
      "Takva događanja dodatno jačaju klupsku kulturu i osjećaj pripadnosti, što je posebno važno za nove obitelji koje se tek uključuju u rad kluba.",
    ],
    publishedAt: "2026-05-07T18:05:00.000Z",
    ctaLabel: "Pogledajte poziv",
  },
] as const;

const fallbackNews: NewsItem[] = fallbackNewsDefinitions.map((item, index) => {
  const id = `fallback-${index + 1}`;

  return {
    id,
    slug: createNewsSlug(item.title, id),
    ...item,
    content: [...item.content],
    imageUrl: fallbackArticleImages[index % fallbackArticleImages.length] ?? null,
  };
});

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getAssetId(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate] as { sys?: { id?: string } } | undefined;
    const assetId = value?.sys?.id;

    if (assetId) {
      return assetId;
    }
  }

  return null;
}

function normalizeImageUrl(url: string | undefined) {
  if (!url) {
    return null;
  }

  return url.startsWith("//") ? `https:${url}` : url;
}

function getParagraphsField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];

    if (typeof value === "string" && value.trim().length > 0) {
      return value
        .split(/\n{2,}|\r\n{2,}/)
        .flatMap((paragraph) => paragraph.split(/\r?\n/))
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export async function fetchNewsFeed(): Promise<NewsFeedResult> {
  const spaceId = import.meta.env.VITE_CONTENTFUL_SPACE_ID;
  const accessToken = import.meta.env.VITE_CONTENTFUL_ACCESS_TOKEN;

  if (!spaceId || !accessToken) {
    return {
      isFallback: true,
      items: fallbackNews,
    };
  }

  const environment = import.meta.env.VITE_CONTENTFUL_ENVIRONMENT ?? "master";
  const contentType = import.meta.env.VITE_CONTENTFUL_NEWS_CONTENT_TYPE ?? "newsArticle";
  const limit = Number(import.meta.env.VITE_CONTENTFUL_NEWS_LIMIT ?? "12");

  const url = new URL(
    `https://cdn.contentful.com/spaces/${spaceId}/environments/${environment}/entries`,
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("content_type", contentType);
  url.searchParams.set("order", "-sys.createdAt");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("include", "2");

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error("Dohvat novosti nije uspio.");
    }

    const payload = (await response.json()) as {
      items?: ContentfulEntry[];
      includes?: {
        Asset?: ContentfulAsset[];
      };
    };

    const assets = new Map(
      (payload.includes?.Asset ?? []).map((asset) => [
        asset.sys?.id,
        normalizeImageUrl(asset.fields?.file?.url),
      ]),
    );

    const items = (payload.items ?? [])
      .map((entry) => {
        const fields = entry.fields ?? {};
        const imageId = getAssetId(fields, ["image", "heroImage", "coverImage", "thumbnail"]);
        const title = getStringField(fields, ["title", "headline", "name"]) || "Novost bez naslova";
        const summary =
          getStringField(fields, ["summary", "excerpt", "description", "body"]) ||
          "Sažetak za ovu objavu još nije dostupan.";
        const content =
          getParagraphsField(fields, ["body", "content", "articleBody", "description", "summary"]) ||
          [];
        const id = entry.sys?.id ?? crypto.randomUUID();

        return {
          id,
          slug: createNewsSlug(title, id),
          eyebrow: getStringField(fields, ["eyebrow", "category", "tag"]) || "Najnovije",
          title,
          summary,
          content: content.length > 0 ? content : [summary],
          publishedAt:
            getStringField(fields, ["publishedAt", "date"]) ||
            entry.sys?.createdAt ||
            new Date().toISOString(),
          ctaLabel: getStringField(fields, ["ctaLabel", "cta", "buttonLabel"]) || "Pročitajte novost",
          imageUrl: imageId ? assets.get(imageId) ?? null : null,
        } satisfies NewsItem;
      })
      .filter((item) => item.title.trim().length > 0);

    return {
      isFallback: items.length === 0,
      items: items.length > 0 ? items : fallbackNews,
    };
  } catch {
    return {
      isFallback: true,
      items: fallbackNews,
    };
  }
}
