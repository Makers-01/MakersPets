import { DesktopShell } from "@/app/desktop/desktop-shell";
import { getDesktopPageData } from "@/lib/chat";
import { copy, getLang } from "@/lib/i18n";

type DesktopPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DesktopPage({ searchParams }: DesktopPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const lang = getLang(resolvedSearchParams.lang);
  const text = copy[lang];
  const data = await getDesktopPageData();

  return (
    <DesktopShell
      lang={lang}
      text={text.desktop}
      conversationId={data.conversationId}
      defaultSkillSlug={data.defaultSkillSlug}
      desktopChatInputEnabled={data.desktopChatInputEnabled}
    />
  );
}
