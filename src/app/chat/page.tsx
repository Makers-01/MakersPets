import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { ChatConsole } from "@/app/chat/chat-console";
import { getChatPageData } from "@/lib/chat";
import { copy, getLang } from "@/lib/i18n";

type ChatPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  noStore();
  const resolvedSearchParams = (await searchParams) ?? {};
  const lang = getLang(resolvedSearchParams.lang);
  const text = copy[lang];
  const chatData = await getChatPageData();

  return (
    <>
      <div className="page-shell top-nav">
        <Link href={`/?lang=${lang}`} className="secondary-link">
          {text.common.appName}
        </Link>
        <div className="lang-switch" aria-label="language switch">
          <a className={`lang-chip ${lang === "zh" ? "active" : ""}`} href="/chat?lang=zh">
            中
          </a>
          <a className={`lang-chip ${lang === "en" ? "active" : ""}`} href="/chat?lang=en">
            EN
          </a>
        </div>
      </div>
      <ChatConsole
        lang={lang}
        petName={chatData.petName}
        conversationId={chatData.conversationId}
        defaultSkillSlug={chatData.defaultSkillSlug}
        initialMessages={chatData.initialMessages}
        skills={chatData.skills}
        text={text.chat}
      />
    </>
  );
}
