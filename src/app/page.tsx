import Link from "next/link";
import { MakersPetStage } from "@/components/pet/makers-pet-stage";
import { bootstrapSummary } from "@/lib/bootstrap";
import { copy, getLang, localeForLang } from "@/lib/i18n";
import { getSystemHealth } from "@/lib/system";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const lang = getLang(resolvedSearchParams.lang);
  const text = copy[lang];
  const locale = localeForLang(lang);
  const health = await getSystemHealth();

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{text.home.eyebrow}</p>
          <h1>{bootstrapSummary.project.name}</h1>
          <p className="lede">{bootstrapSummary.project.mission}</p>
        </div>
        <div className="hero-side">
          <div className="lang-switch" aria-label="language switch">
            <a className={`lang-chip ${lang === "zh" ? "active" : ""}`} href="/?lang=zh">
              中
            </a>
            <a className={`lang-chip ${lang === "en" ? "active" : ""}`} href="/?lang=en">
              EN
            </a>
          </div>
          <div className="hero-actions">
            <Link href={`/chat?lang=${lang}`} className="secondary-link">
              {text.common.openChat}
            </Link>
            <Link href={`/admin?lang=${lang}`} className="primary-link">
              {text.common.openAdmin}
            </Link>
            <Link href="/api/health" className="secondary-link">
              {text.common.healthApi}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid two-up">
        <article className="panel">
          <div className="section-head">
            <h2>{text.home.chat}</h2>
            <p>{text.home.chatHint}</p>
          </div>
          <div className="pet-preview-card">
            <MakersPetStage name="Makers" compact />
            <div className="stack-block info-card">
              <strong>Makers</strong>
              <p>{text.home.chatHint}</p>
            </div>
            <Link href={`/chat?lang=${lang}`} className="primary-link panel-link">
              {text.common.openChat}
            </Link>
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>{text.home.direction}</h2>
            <p>{text.home.directionHint}</p>
          </div>
          <ul className="clean-list compact-list">
            {text.home.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>{text.home.runtime}</h2>
            <p>{text.home.runtimeHint}</p>
          </div>
          <dl className="stats-list">
            <div>
              <dt>{text.common.configured}</dt>
              <dd>{health.databaseConfigured ? text.common.yes : text.common.no}</dd>
            </div>
            <div>
              <dt>{text.common.reachable}</dt>
              <dd>{health.databaseReachable ? text.common.yes : text.common.no}</dd>
            </div>
            <div>
              <dt>{text.home.checkedAt}</dt>
              <dd>{new Date(health.checkedAt).toLocaleString(locale)}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
