import { createInterface } from "node:readline/promises";
import { Store } from "../server/database";
import { FinalsService } from "../server/service";
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username =
    process.env.ADMIN_USERNAME ||
    (await rl.question("管理员账号（英文/数字）："));
  const name = process.env.ADMIN_NAME || (await rl.question("显示姓名："));
  rl.close();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY)
      throw new Error("非交互运行请通过 ADMIN_PASSWORD 环境变量提供密码");
    process.stdout.write("密码（至少 12 位，输入不回显）：");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    password = await new Promise<string>((resolve, reject) => {
      let value = "";
      const read = (chunk: Buffer) => {
        for (const char of chunk.toString()) {
          if (char === "\u0003") {
            cleanup();
            reject(new Error("已取消"));
            return;
          }
          if (char === "\r" || char === "\n") {
            cleanup();
            resolve(value);
            return;
          }
          if (char === "\u007f") {
            value = value.slice(0, -1);
          } else value += char;
        }
      };
      const cleanup = () => {
        process.stdin.off("data", read);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
      };
      process.stdin.on("data", read);
    });
  }
  const store = new Store();
  try {
    const u = await new FinalsService(store).createUser({
      username,
      name,
      password,
      roles: ["admin"],
    });
    console.log(`已创建管理员：${u.username}（${u.name}）`);
  } finally {
    store.close();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
