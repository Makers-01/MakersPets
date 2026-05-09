import { prisma } from "@/lib/db";
import type { UiLang } from "@/lib/i18n";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_LOCATION = "Shanghai";

type LiveContext = {
  prompt: string;
};

function detectWeatherQuery(message: string) {
  return /(天气|温度|下雨|晴天|阴天|weather|temperature|rain|forecast)/i.test(message);
}

function formatCurrentDateTime(timezone: string, lang: UiLang) {
  const date = new Date();
  const locale = lang === "en" ? "en-US" : "zh-CN";
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: timezone
  });

  return formatter.format(date);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function weatherCodeSummary(code: number, lang: UiLang) {
  const zh: Record<number, string> = {
    0: "晴",
    1: "基本晴朗",
    2: "局部多云",
    3: "阴",
    45: "有雾",
    48: "有霜雾",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "较强毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "较强阵雨",
    82: "强阵雨",
    95: "雷暴"
  };

  const en: Record<number, string> = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm"
  };

  return (lang === "en" ? en : zh)[code] ?? (lang === "en" ? "Unknown" : "未知天气");
}

async function getRuntimeDefaults() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ["reminders.timezone", "profile.default-location"]
      }
    }
  });

  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    timezone: asString(map.get("reminders.timezone"), DEFAULT_TIMEZONE),
    location: asString(map.get("profile.default-location"), DEFAULT_LOCATION)
  };
}

async function fetchWeatherSummary(location: string, lang: UiLang) {
  const geoResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=${
      lang === "en" ? "en" : "zh"
    }&format=json`,
    { cache: "no-store" }
  );

  if (!geoResponse.ok) {
    throw new Error(`Geocoding failed with ${geoResponse.status}`);
  }

  const geoPayload = (await geoResponse.json()) as {
    results?: Array<{
      name: string;
      country?: string;
      admin1?: string;
      latitude: number;
      longitude: number;
      timezone?: string;
    }>;
  };

  const target = geoPayload.results?.[0];
  if (!target) {
    throw new Error("No location match");
  }

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`,
    { cache: "no-store" }
  );

  if (!weatherResponse.ok) {
    throw new Error(`Weather failed with ${weatherResponse.status}`);
  }

  const weatherPayload = (await weatherResponse.json()) as {
    current?: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      time: string;
    };
  };

  const current = weatherPayload.current;
  if (!current) {
    throw new Error("Missing current weather");
  }

  const locationLabel = [target.name, target.admin1, target.country].filter(Boolean).join(", ");
  const condition = weatherCodeSummary(current.weather_code, lang);

  return lang === "en"
    ? `Current weather for ${locationLabel}: ${condition}, ${current.temperature_2m}°C, feels like ${current.apparent_temperature}°C, wind ${current.wind_speed_10m} km/h, observed at ${current.time}.`
    : `${locationLabel} 当前天气：${condition}，气温 ${current.temperature_2m}°C，体感 ${current.apparent_temperature}°C，风速 ${current.wind_speed_10m} km/h，观测时间 ${current.time}。`;
}

export async function buildLiveContextPrompt(message: string, lang: UiLang): Promise<LiveContext> {
  const { timezone, location } = await getRuntimeDefaults();
  const currentDateTime = formatCurrentDateTime(timezone, lang);
  const parts: string[] = [];

  parts.push(
    lang === "en"
      ? `Current local date and time (${timezone}): ${currentDateTime}. Use this as the authoritative current time.`
      : `当前本地日期时间（${timezone}）：${currentDateTime}。回答现在的时间或日期时，请以这个时间为准。`
  );

  if (detectWeatherQuery(message)) {
    try {
      const weatherSummary = await fetchWeatherSummary(location, lang);
      parts.push(
        lang === "en"
          ? `${weatherSummary} If the user asks about weather, answer from this live weather context and mention the location used if needed.`
          : `${weatherSummary} 如果用户询问天气，请基于这条实时天气信息回答，并在有需要时说明你使用的是这个地点。`
      );
    } catch {
      parts.push(
        lang === "en"
          ? `Weather lookup was unavailable just now. If weather is asked, say you could not refresh the weather data.`
          : "刚刚实时天气查询失败了。如果用户问天气，请明确说明这次没能刷新到天气数据。"
      );
    }
  }

  return {
    prompt: parts.join("\n")
  };
}
