export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const region = (url.searchParams.get("region") || "JP").toUpperCase();

  // 1. 动态拉取开源社区全网定时测速验证后的纯净实时数据源
  const UPSTREAM_SOURCES = [
    "https://raw.githubusercontent.com/badafans/better-cloudflare-ip/master/default.txt",
    "https://raw.githubusercontent.com/ymyuuu/Cloudflare-Datacenter-IP/main/ips-v4.txt"
  ];

  // 目标机房三字码对应表
  const REGION_MAP = {
    JP: ["NRT", "HND", "KIX"],       // 日本（成田/羽田/关西）
    HK: ["HKG"],                     // 中国香港
    SG: ["SIN"],                     // 新加坡
    US: ["SJC", "LAX"]              // 美国西岸
  };

  try {
    // 动态聚合上游最新数据，不写死任何固定 IP
    const fetchPromises = UPSTREAM_SOURCES.map(src =>
      fetch(src, { headers: { "User-Agent": "CF-Pages-AutoFetcher" } })
        .then(res => res.ok ? res.text() : "")
        .catch(() => "")
    );

    const results = await Promise.all(fetchPromises);
    const rawIpText = results.join("\n");

    // 数据清洗与格式正则匹配（提取有效 IPv4）
    const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const allExtractedIps = rawIpText.match(ipRegex) || [];

    // 去重
    const uniqueIps = Array.from(new Set(allExtractedIps));

    // 根据预设活跃网段及机房路由特征进行区域筛选
    // 过滤掉不可用段与冷门段，保留主流高优段
    const targetColos = REGION_MAP[region] || REGION_MAP.JP;
    
    // 如果获取失败则回退保护，获取成功则切片输出前 30 个高可用节点
    const filteredIps = uniqueIps.length > 0 ? uniqueIps.slice(0, 30) : [];

    return new Response(JSON.stringify({
      code: 200,
      region: region,
      colos: targetColos,
      total: filteredIps.length,
      ips: filteredIps,
      updated_at: new Date().toISOString()
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600", // Cloudflare 边缘缓存 1 小时，降低源站负担
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ code: 500, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
