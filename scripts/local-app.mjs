import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  access,
  appendFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeScript = path.join(
  appRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const runtimeGuard = pathToFileURL(
  path.join(appRoot, "scripts", "local-runtime-guard.mjs"),
).href;
const defaultPort = 5180;
const appId = "xianjian-local-room";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function options(args) {
  const result = {
    command: "start",
    port: defaultPort,
    open: true,
    openData: false,
    dataDir: undefined,
  };
  const words = [...args];
  if (words[0] && !words[0].startsWith("--")) result.command = words.shift();
  while (words.length) {
    const flag = words.shift();
    if (flag === "--no-open") {
      result.open = false;
      result.openData = false;
    } else if (flag === "--open") {
      result.open = true;
      result.openData = true;
    } else if (flag === "--help" || flag === "-h") result.command = "help";
    else if (flag === "--data-dir" || flag === "--port") {
      const value = words.shift();
      if (!value || value.startsWith("--"))
        throw new Error(`${flag} 缺少参数。`);
      if (flag === "--data-dir") result.dataDir = value;
      else result.port = Number(value);
    } else throw new Error(`无法识别参数：${flag}`);
  }
  if (!["start", "stop", "status", "data", "help"].includes(result.command)) {
    throw new Error("命令应为 start、stop、status 或 data。");
  }
  if (
    !Number.isInteger(result.port) ||
    result.port < 1024 ||
    result.port > 65535
  ) {
    throw new Error("端口应为 1024–65535 的整数。");
  }
  const parent =
    process.env.LOCALAPPDATA || path.join(homedir(), ".local", "share");
  result.dataDir = path.resolve(
    result.dataDir ||
      process.env.GUITAR_ROOM_DATA_DIR ||
      path.join(parent, "GuitarRoom"),
  );
  return result;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

// Launcher records may be left truncated by an interrupted older release.
// App configuration still uses strict JSON parsing.
async function readLauncherRecord(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function publishJson(file, value) {
  const temp = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

async function windowsStartMutex(dataDir) {
  const identity = (await realpath(dataDir)).toLowerCase();
  const key = createHash("sha256").update(identity).digest("hex");
  const mutex = createNetServer((socket) => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      mutex.once("error", reject);
      mutex.listen(`\\\\.\\pipe\\guitar-room-${key}`, resolve);
    });
    // The kernel owns exclusivity; records on disk only describe the instance.
    // libuv uses FILE_FLAG_FIRST_PIPE_INSTANCE, and Windows releases the pipe
    // even when the console closes without running JavaScript cleanup.
    return mutex;
  } catch (error) {
    if (error.code === "EADDRINUSE") return undefined;
    throw error;
  }
}

async function closeServer(server) {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function control(record, command) {
  if (
    !record ||
    record.app !== appId ||
    !Number.isInteger(record.controlPort) ||
    !record.token
  )
    return undefined;
  try {
    const response = await fetch(
      `http://127.0.0.1:${record.controlPort}/${command}`,
      {
        method: command === "stop" ? "POST" : "GET",
        headers: { Authorization: `Bearer ${record.token}` },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!response.ok) return undefined;
    const result = await response.json();
    return result.app === appId && result.pid === record.pid
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

function detachedHelper(command, args) {
  const helper = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  helper.on("error", (error) =>
    console.warn(`无法自动打开浏览器：${error.message}`),
  );
  helper.unref();
}

function openBrowser(url) {
  if (process.platform === "win32")
    detachedHelper("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
  else if (process.platform === "darwin") detachedHelper("open", [url]);
  else detachedHelper("xdg-open", [url]);
}

async function portAvailable(port) {
  const probe = createNetServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch (error) {
    if (error.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (probe.listening) await new Promise((resolve) => probe.close(resolve));
  }
}

async function run() {
  const selected = options(process.argv.slice(2));
  if (selected.command === "help") {
    console.log(
      "弦间本地版\n  local-app.mjs start [--no-open] [--data-dir 路径] [--port 5180]\n  local-app.mjs stop | status | data [--data-dir 路径]\n  local-app.mjs data --open 打开本机数据目录\n曲谱保存在本机，程序只监听 127.0.0.1。关闭网页不会停止程序，请使用停止入口或 Ctrl+C。",
    );
    return;
  }
  const dataDir = selected.dataDir;
  const stateFile = path.join(dataDir, "launcher.json");
  const lockFile = path.join(dataDir, "launcher.lock");
  if (selected.command === "data") {
    console.log(dataDir);
    if (selected.openData) {
      await mkdir(dataDir, { recursive: true });
      if (process.platform === "win32")
        detachedHelper("explorer.exe", [dataDir]);
      else
        detachedHelper(process.platform === "darwin" ? "open" : "xdg-open", [
          dataDir,
        ]);
    }
    return;
  }
  if (selected.command === "stop" || selected.command === "status") {
    const record = await readLauncherRecord(stateFile);
    const status = await control(record, selected.command);
    if (!status) {
      if (record && processExists(record.pid))
        throw new Error(
          "琴房进程仍在，但停止入口暂时不可达。请在原启动窗口按 Ctrl+C；不会终止其他程序。",
        );
      console.log("弦间本地版未运行。");
      return;
    }
    if (selected.command === "status") {
      console.log(JSON.stringify(status));
      return;
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && processExists(record.pid)) await delay(100);
    if (processExists(record.pid))
      throw new Error("停止仍在进行，请查看日志后重试。");
    console.log("弦间本地版已停止，曲谱保留在 " + dataDir);
    return;
  }
  if (
    Number(process.versions.node.split(".")[0]) < 22 ||
    (Number(process.versions.node.split(".")[0]) === 22 &&
      Number(process.versions.node.split(".")[1]) < 13)
  )
    throw new Error("本地版需要随包提供的 Node.js 22.13 或更高运行时。");
  await access(runtimeScript).catch(() => {
    throw new Error(
      "本地运行时缺失，请重新解压完整发行包；无需安装 Node.js 或联网下载。",
    );
  });
  await mkdir(dataDir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  let instanceMutex;
  let lock;
  if (process.platform === "win32") {
    for (let wait = 0; wait <= 20; wait++) {
      instanceMutex = await windowsStartMutex(dataDir);
      if (instanceMutex) break;
      const active = await control(
        await readLauncherRecord(stateFile),
        "status",
      );
      if (active) {
        if (selected.open && active.ready) openBrowser(active.url);
        console.log(
          active.ready
            ? "弦间已在运行：" + active.url
            : "弦间正在启动，请稍候。日志：" + path.join(dataDir, "logs"),
        );
        return;
      }
      if (wait < 20) await delay(250);
    }
    if (!instanceMutex)
      throw new Error(
        "此数据目录已有启动进程，请等待启动完成或在原窗口停止。不会再启动第二个琴房。",
      );
    try {
      const oldLock = await readLauncherRecord(lockFile);
      const priorRecord = await readLauncherRecord(stateFile);
      const active = await control(priorRecord, "status");
      if (active) {
        if (selected.open && active.ready) openBrowser(active.url);
        console.log("弦间已在运行：" + active.url);
        await closeServer(instanceMutex);
        return;
      }
      // A legacy launcher has no kernel mutex. Keep its live PID protected;
      // never try to terminate a PID merely because a record names it.
      if (
        [oldLock, priorRecord].some(
          (prior) =>
            prior &&
            prior.mutex !== "windows-pipe-v1" &&
            processExists(prior.pid),
        )
      )
        throw new Error(
          "此数据目录已有启动进程，请等待启动完成或在原窗口停止。不会再启动第二个琴房。",
        );
      await publishJson(lockFile, {
        app: appId,
        pid: process.pid,
        token,
        mutex: "windows-pipe-v1",
      });
      lock = true;
    } catch (error) {
      await closeServer(instanceMutex);
      throw error;
    }
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        lock = await open(lockFile, "wx", 0o600);
        await lock.writeFile(
          JSON.stringify({ app: appId, pid: process.pid, token }),
        );
        await lock.close();
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let prior = await readLauncherRecord(stateFile);
        for (let wait = 0; wait < 20; wait++) {
          const active = await control(prior, "status");
          if (active) {
            if (selected.open && active.ready) openBrowser(active.url);
            console.log(
              active.ready
                ? "弦间已在运行：" + active.url
                : "弦间正在启动，请稍候。日志：" + path.join(dataDir, "logs"),
            );
            return;
          }
          const oldLock = await readLauncherRecord(lockFile);
          if (!oldLock || !processExists(oldLock.pid)) break;
          await delay(250);
          prior = await readLauncherRecord(stateFile);
        }
        const oldLock = await readLauncherRecord(lockFile);
        if (oldLock && processExists(oldLock.pid))
          throw new Error(
            "此数据目录已有启动进程，请等待启动完成或在原窗口停止。不会再启动第二个琴房。",
          );
        await unlink(lockFile).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  }
  if (!lock) throw new Error("无法取得本地琴房启动锁，请重试。");

  const logsDir = path.join(dataDir, "logs");
  const runtimeDir = path.join(dataDir, "runtime");
  const persistDir = path.join(dataDir, "persist");
  const logfile = path.join(
    logsDir,
    "app-" + new Date().toISOString().slice(0, 10) + ".log",
  );
  try {
    await Promise.all([
      mkdir(logsDir, { recursive: true }),
      mkdir(runtimeDir, { recursive: true }),
      mkdir(persistDir, { recursive: true }),
    ]);
  } catch (error) {
    await unlink(lockFile).catch(() => {});
    await closeServer(instanceMutex);
    throw error;
  }
  const log = (text) =>
    appendFile(logfile, `[${new Date().toISOString()}] ${text}\n`).catch(
      () => {},
    );
  const localEnv = {
    ...process.env,
    NODE_ENV: "production",
    GUITAR_ROOM_LOCAL_APP: "1",
    GUITAR_ROOM_DATA_DIR: dataDir,
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(logsDir, "wrangler"),
    WRANGLER_REGISTRY_PATH: path.join(runtimeDir, "dev-registry"),
    MINIFLARE_REGISTRY_PATH: path.join(runtimeDir, "registry"),
    CI: "true",
    NO_COLOR: "1",
  };
  let child;
  let closing = false;
  let ready = false;
  let controlServer;
  let record;
  const saveRecord = async () => {
    await publishJson(stateFile, { ...record, childPid: child?.pid, ready });
  };
  const stopChild = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const target = child;
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn(
          "taskkill.exe",
          ["/PID", String(target.pid), "/T", "/F"],
          { stdio: "ignore", windowsHide: true },
        );
        killer.once("error", resolve);
        killer.once("close", resolve);
      });
    } else {
      try {
        process.kill(-target.pid, "SIGTERM");
      } catch {
        target.kill("SIGTERM");
      }
    }
    await Promise.race([
      new Promise((resolve) => target.once("close", resolve)),
      delay(3000),
    ]);
    if (target.exitCode === null && target.signalCode === null)
      target.kill("SIGKILL");
  };
  let cleanupPromise;
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    closing = true;
    cleanupPromise = (async () => {
      try {
        await log("停止本地琴房。");
        await stopChild();
        await closeServer(controlServer);
        const ownLock = await readLauncherRecord(lockFile).catch(
          () => undefined,
        );
        if (ownLock?.token === token) {
          await unlink(stateFile).catch(() => {});
          await unlink(lockFile).catch(() => {});
        }
      } finally {
        await closeServer(instanceMutex);
      }
    })();
    return cleanupPromise;
  };
  let interrupted;
  const cancelled = new Promise((_, reject) => {
    interrupted = reject;
  });
  cancelled.catch(() => {});
  const shutdown = (exitCode = 0) => {
    interrupted(new Error("本地琴房已停止。"));
    void cleanup().then(() => process.exit(exitCode));
  };
  process.once("SIGINT", () => shutdown());
  process.once("SIGTERM", () => shutdown());
  const command = async (args) => {
    if (closing) throw new Error("启动已取消。");
    const phase = args.slice(0, 3).join(" ");
    await log("数据库命令开始：" + phase);
    let output = "";
    let errors = "";
    child = spawn(
      process.execPath,
      ["--import", runtimeGuard, runtimeScript, ...args],
      {
        cwd: appRoot,
        env: localEnv,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
        detached: process.platform !== "win32",
      },
    );
    await saveRecord();
    child.stdout.on("data", (data) => {
      output += data.toString();
      void log(data.toString().trimEnd());
    });
    child.stderr.on("data", (data) => {
      errors += data.toString();
      void log(data.toString().trimEnd());
    });
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => {
          void log(
            `数据库命令结束：${phase}；退出码 ${code}；信号 ${signal || "无"}。`,
          );
          if (code === 0) resolve(output);
          else {
            const details =
              errors.trim() || output.trim() || "命令没有返回诊断信息。";
            reject(
              new Error(
                `本地数据库命令 ${phase} 失败（退出码 ${code}，信号 ${signal || "无"}）。\n${details.slice(-1500)}\n日志：${logfile}`,
              ),
            );
          }
        });
      }),
      cancelled,
    ]);
    child = undefined;
    await saveRecord();
    return result;
  };
  try {
    await log(
      `启动；程序 ${appRoot}；数据 ${dataDir}；端口 ${selected.port}。`,
    );
    if (!(await portAvailable(selected.port)))
      throw new Error(
        `本机端口 ${selected.port} 已被其他程序占用。关闭占用程序，或使用 --port 指定其他端口；不会终止其他程序。`,
      );
    controlServer = createServer((request, response) => {
      const provided = Buffer.from(request.headers.authorization || "");
      const expected = Buffer.from("Bearer " + token);
      const authorized =
        !request.headers.origin &&
        provided.length === expected.length &&
        timingSafeEqual(provided, expected);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json");
      if (!authorized) {
        response.writeHead(403);
        response.end('{"error":"forbidden"}');
        return;
      }
      if (
        (request.url === "/status" && request.method === "GET") ||
        (request.url === "/stop" && request.method === "POST")
      ) {
        response.end(
          JSON.stringify({
            app: appId,
            pid: process.pid,
            url: record.url,
            ready,
            stopping: request.url === "/stop",
          }),
        );
        if (request.url === "/stop") setTimeout(() => shutdown(), 100);
      } else {
        response.writeHead(404);
        response.end('{"error":"not found"}');
      }
    });
    await new Promise((resolve, reject) => {
      controlServer.once("error", reject);
      controlServer.listen(0, "127.0.0.1", resolve);
    });
    record = {
      app: appId,
      pid: process.pid,
      token,
      mutex: process.platform === "win32" ? "windows-pipe-v1" : undefined,
      controlPort: controlServer.address().port,
      url: `http://127.0.0.1:${selected.port}/`,
      port: selected.port,
      dataDir,
      startedAt: new Date().toISOString(),
    };
    await saveRecord();
    const sourceConfig = path.join(appRoot, "dist", "server", "wrangler.json");
    const config = await readJson(sourceConfig);
    if (
      !config?.main ||
      !config.assets?.directory ||
      !config.d1_databases?.some((database) => database.binding === "DB") ||
      !config.r2_buckets?.some((bucket) => bucket.binding === "BUCKET")
    )
      throw new Error("预编译程序或本地数据库配置不完整，请重新解压发行包。");
    const originalDir = path.dirname(sourceConfig);
    const migrationsDir = path.join(appRoot, "drizzle");
    await access(migrationsDir);
    const localConfig = {
      ...config,
      main: path.resolve(originalDir, config.main),
      base_dir: originalDir,
      assets: {
        ...config.assets,
        directory: path.resolve(originalDir, config.assets.directory),
      },
      vars: { ...config.vars, GUITAR_ROOM_LOCAL_APP: "1" },
      d1_databases: config.d1_databases.map((database) => ({
        ...database,
        remote: false,
        migrations_dir: migrationsDir,
      })),
      r2_buckets: config.r2_buckets.map((bucket) => ({
        ...bucket,
        remote: false,
      })),
      dev: {
        ...config.dev,
        ip: "127.0.0.1",
        port: selected.port,
        local_protocol: "http",
        enable_containers: false,
        generate_types: false,
      },
      observability: { enabled: false },
    };
    delete localConfig.build;
    const configFile = path.join(runtimeDir, "wrangler.json");
    await writeFile(configFile, JSON.stringify(localConfig, null, 2));
    const dbArgs = [
      "--local",
      "--config",
      configFile,
      "--persist-to",
      persistDir,
    ];
    const raw = await command([
      "d1",
      "execute",
      "DB",
      ...dbArgs,
      "--command",
      "SELECT name FROM sqlite_master WHERE type='table'",
      "--json",
    ]);
    const tableResult = JSON.parse(raw);
    const names = new Set(
      tableResult
        .flatMap((item) => item.results || [])
        .map((item) => item.name),
    );
    const existing = ["scores", "files", "fingerings"].filter((name) =>
      names.has(name),
    );
    if (existing.length && existing.length !== 3)
      throw new Error(
        "本地数据库缺少部分表。请保留数据目录并恢复备份；启动器不会覆盖现有数据。",
      );
    let needsBaseline = existing.length === 3 && !names.has("d1_migrations");
    if (existing.length === 3 && names.has("d1_migrations")) {
      const migrationRaw = await command([
        "d1",
        "execute",
        "DB",
        ...dbArgs,
        "--command",
        "SELECT name FROM d1_migrations WHERE name = '0000_left_gwen_stacy.sql' LIMIT 1",
        "--json",
      ]);
      needsBaseline = !JSON.parse(migrationRaw).some((item) =>
        (item.results || []).some(
          (migration) => migration.name === "0000_left_gwen_stacy.sql",
        ),
      );
    }
    if (needsBaseline) {
      const schemaRaw = await command([
        "d1",
        "execute",
        "DB",
        ...dbArgs,
        "--command",
        "SELECT 'scores' AS tbl,name FROM pragma_table_info('scores') UNION ALL SELECT 'files',name FROM pragma_table_info('files') UNION ALL SELECT 'fingerings',name FROM pragma_table_info('fingerings')",
        "--json",
      ]);
      const columns = new Set(
        JSON.parse(schemaRaw)
          .flatMap((item) => item.results || [])
          .map((item) => item.tbl + ":" + item.name),
      );
      const expected = {
        scores: ["id", "owner", "body", "updated_at"],
        files: [
          "id",
          "owner",
          "score_id",
          "object_key",
          "name",
          "type",
          "size",
        ],
        fingerings: ["id", "owner", "body"],
      };
      if (
        Object.entries(expected).some(([table, fields]) =>
          fields.some((field) => !columns.has(table + ":" + field)),
        )
      )
        throw new Error("现有数据库结构无法确认，请保留数据并查看日志。");
      await command([
        "d1",
        "execute",
        "DB",
        ...dbArgs,
        "--command",
        "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0000_left_gwen_stacy.sql');",
        "--json",
      ]);
    }
    await command(["d1", "migrations", "apply", "DB", ...dbArgs]);
    if (closing) throw new Error("启动已取消。");
    child = spawn(
      process.execPath,
      [
        "--import",
        runtimeGuard,
        runtimeScript,
        "dev",
        "--config",
        configFile,
        "--local",
        "--persist-to",
        persistDir,
        "--ip",
        "127.0.0.1",
        "--port",
        String(selected.port),
        "--inspector-port",
        "0",
        "--show-interactive-dev-session",
        "false",
        "--log-level",
        "warn",
      ],
      {
        cwd: appRoot,
        env: localEnv,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
        detached: process.platform !== "win32",
      },
    );
    await saveRecord();
    child.stdout.on("data", (data) => {
      void log(data.toString().trimEnd());
    });
    child.stderr.on("data", (data) => {
      void log(data.toString().trimEnd());
    });
    child.once("error", (error) => {
      console.error("本地运行时启动失败。日志：" + logfile);
      void log("运行时错误：" + error.message);
      shutdown(1);
    });
    child.once("close", (code) => {
      if (!closing) {
        console.error("本地服务异常退出。日志：" + logfile);
        void log("本地服务退出：" + code);
        shutdown(1);
      }
    });
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (closing || child.exitCode !== null)
        throw new Error("本地服务未能启动，请查看 " + logfile);
      try {
        const response = await fetch(record.url + "api/scores", {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok && Array.isArray((await response.json()).scores)) {
          ready = true;
          break;
        }
        if (response.status === 403)
          throw new Error(
            `本地发行模式未启用，请更新预编译发行包。日志：${logfile}`,
          );
      } catch (error) {
        if (error.message.includes("发行模式")) throw error;
      }
      await Promise.race([delay(300), cancelled]);
    }
    if (!ready) throw new Error("本地服务启动超时，请查看 " + logfile);
    await saveRecord();
    await log("已就绪：" + record.url);
    console.log(
      "弦间本地版已启动：" +
        record.url +
        "\n数据：" +
        dataDir +
        "\n日志：" +
        logfile +
        "\n使用停止入口或 Ctrl+C 退出，关闭网页不会停止程序。",
    );
    if (selected.open) openBrowser(record.url);
    await new Promise(() => {});
  } catch (error) {
    await log("错误：" + error.message);
    await cleanup();
    if (!error.message.includes(logfile)) error.message += "\n日志：" + logfile;
    throw error;
  }
}

run().catch((error) => {
  console.error("弦间本地版：" + error.message);
  process.exitCode = 1;
});
