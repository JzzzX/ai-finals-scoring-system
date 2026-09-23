type FeishuTokenResponse = {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  access_token?: string;
  data?: {
    access_token?: string;
  };
};

type FeishuUserInfoResponse = {
  code?: number;
  msg?: string;
  data?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
    tenant_key?: string;
    name?: string;
    en_name?: string;
    email?: string;
    enterprise_email?: string;
    avatar_url?: string;
  };
};

export type FeishuIdentity = {
  provider: "feishu";
  tenantId: string;
  subjectId: string;
  unionId?: string;
  userId?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
};

type FeishuConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  tenantKey?: string;
  scope?: string;
};

const AUTHORIZE_URL =
  "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const TOKEN_URL =
  "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const USER_INFO_URL =
  "https://open.feishu.cn/open-apis/authen/v1/user_info";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function feishuConfigured() {
  return Boolean(
    process.env.FEISHU_APP_ID?.trim() &&
      process.env.FEISHU_APP_SECRET?.trim() &&
      process.env.FEISHU_REDIRECT_URI?.trim(),
  );
}

export function feishuConfig(): FeishuConfig {
  return {
    appId: required("FEISHU_APP_ID"),
    appSecret: required("FEISHU_APP_SECRET"),
    redirectUri: required("FEISHU_REDIRECT_URI"),
    tenantKey: process.env.FEISHU_TENANT_KEY?.trim() || undefined,
    scope: process.env.FEISHU_SCOPE?.trim() || undefined,
  };
}

export function feishuAuthorizeUrl(state: string) {
  const config = feishuConfig();
  const url = new URL(AUTHORIZE_URL);

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);

  if (config.scope) url.searchParams.set("scope", config.scope);

  return url.toString();
}

export async function fetchFeishuIdentity(
  code: string,
): Promise<FeishuIdentity> {
  const config = feishuConfig();

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const tokenBody = (await tokenResponse.json()) as FeishuTokenResponse;
  const accessToken =
    tokenBody.access_token || tokenBody.data?.access_token;

  if (
    !tokenResponse.ok ||
    (tokenBody.code !== undefined && tokenBody.code !== 0) ||
    !accessToken
  ) {
    throw new Error(
      `飞书授权码换取失败：${
        tokenBody.msg ||
        tokenBody.error_description ||
        tokenBody.error ||
        tokenResponse.status
      }`,
    );
  }

  const userResponse = await fetch(USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  const userBody = (await userResponse.json()) as FeishuUserInfoResponse;

  if (
    !userResponse.ok ||
    (userBody.code !== undefined && userBody.code !== 0) ||
    !userBody.data
  ) {
    throw new Error(
      `获取飞书登录用户失败：${userBody.msg || userResponse.status}`,
    );
  }

  const info = userBody.data;

  if (!info.open_id || !info.tenant_key)
    throw new Error("飞书返回的稳定身份信息不完整");

  if (config.tenantKey && info.tenant_key !== config.tenantKey)
    throw new Error("当前飞书企业不在允许登录范围");

  return {
    provider: "feishu",
    tenantId: info.tenant_key,
    subjectId: info.open_id,
    unionId: info.union_id,
    userId: info.user_id,
    name: info.name || info.en_name || "飞书用户",
    email: info.enterprise_email || info.email,
    avatarUrl: info.avatar_url,
  };
}


type FeishuTenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
};

type FeishuDirectoryRawUser = {
  open_id?: string;
  union_id?: string;
  user_id?: string;
  name?: string;
  en_name?: string;
  department_ids?: string[];
  departments?: string[];
  avatar_url?: string;
  avatar?: {
    avatar_72?: string;
    avatar_240?: string;
    avatar_640?: string;
    avatar_origin?: string;
  };
};

type FeishuDirectoryResponse = {
  code?: number;
  msg?: string;
  data?: {
    users?: FeishuDirectoryRawUser[];
    user_infos?: FeishuDirectoryRawUser[];
    has_more?: boolean;
    page_token?: string;
  };
};

export type FeishuDirectoryUser = {
  tenantId: string;
  openId: string;
  unionId?: string;
  userId?: string;
  name: string;
  enName?: string;
  avatarUrl?: string;
  departmentIds: string[];
};

const TENANT_TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

const DIRECTORY_URL =
  "https://open.feishu.cn/open-apis/contact/v2/department/user/detail/list";

let directoryCache:
  | {
      expiresAt: number;
      users: FeishuDirectoryUser[];
    }
  | undefined;

async function fetchTenantAccessToken() {
  const config = feishuConfig();

  const response = await fetch(TENANT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const body = (await response.json()) as FeishuTenantTokenResponse;

  if (
    !response.ok ||
    (body.code !== undefined && body.code !== 0) ||
    !body.tenant_access_token
  ) {
    throw new Error(
      `获取飞书 tenant_access_token 失败：${body.msg || response.status}`,
    );
  }

  return body.tenant_access_token;
}

async function loadFeishuDirectory() {
  if (
    directoryCache &&
    directoryCache.expiresAt > Date.now()
  ) {
    return directoryCache.users;
  }

  const config = feishuConfig();

  if (!config.tenantKey)
    throw new Error(
      "缺少 FEISHU_TENANT_KEY，无法安全配置飞书成员权限",
    );

  const token = await fetchTenantAccessToken();

  const users = new Map<string, FeishuDirectoryUser>();
  let pageToken = "";

  do {
    const url = new URL(DIRECTORY_URL);

    url.searchParams.set("id", "0");
    url.searchParams.set("page_size", "100");
    url.searchParams.set("fetch_child", "true");

    if (pageToken)
      url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(20000),
    });

    const body =
      (await response.json()) as FeishuDirectoryResponse;

    if (
      !response.ok ||
      (body.code !== undefined && body.code !== 0)
    ) {
      throw new Error(
        `读取飞书通讯录失败：${body.msg || response.status}`,
      );
    }

    const items =
      body.data?.users ||
      body.data?.user_infos ||
      [];

    for (const raw of items) {
      if (!raw.open_id || !raw.name) continue;

      users.set(raw.open_id, {
        tenantId: config.tenantKey,
        openId: raw.open_id,
        unionId: raw.union_id,
        userId: raw.user_id,
        name: raw.name,
        enName: raw.en_name,
        avatarUrl:
          raw.avatar?.avatar_72 ||
          raw.avatar?.avatar_240 ||
          raw.avatar_url,
        departmentIds:
          raw.department_ids ||
          raw.departments ||
          [],
      });
    }

    if (body.data?.has_more) {
      pageToken = body.data.page_token || "";

      if (!pageToken)
        throw new Error("飞书通讯录分页状态异常");
    } else {
      pageToken = "";
    }

    if (pageToken)
      await new Promise((resolve) => setTimeout(resolve, 20));
  } while (pageToken);

  const result = [...users.values()];

  directoryCache = {
    users: result,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return result;
}

export async function searchFeishuDirectoryUsers(
  query: string,
  limit = 20,
) {
  const q = query.trim().toLowerCase();

  if (!q) return [];

  const users = await loadFeishuDirectory();

  return users
    .filter((user) =>
      [
        user.name,
        user.enName || "",
        user.userId || "",
        user.openId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .sort((a, b) => {
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();

      const as = an === q ? 0 : an.startsWith(q) ? 1 : 2;
      const bs = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;

      return as - bs || a.name.localeCompare(b.name, "zh-CN");
    })
    .slice(0, Math.max(1, Math.min(limit, 50)));
}

export async function findFeishuDirectoryUser(
  openId: string,
) {
  const users = await loadFeishuDirectory();

  return (
    users.find((user) => user.openId === openId) ||
    null
  );
}
