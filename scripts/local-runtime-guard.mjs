// Wrangler disconnects IPC before its normal asynchronous shutdown finishes.
// Only a confirmed parent exit means the launcher has gone away; an IPC close
// by itself must never turn a successful database command into a failure.
import { spawn } from "node:child_process";

const parentPid = process.ppid;

function parentExited() {
  try {
    process.kill(parentPid, 0);
    return false;
  } catch (error) {
    // Permission or transient errors do not prove that our parent is dead.
    return error.code === "ESRCH";
  }
}

if (process.channel && parentPid > 1) {
  process.once("disconnect", () => {
    const checkParent = () => {
      if (!parentExited()) {
        // Keep watching after a normal disconnect in case the console is
        // closed during cleanup. An unref'ed timer does not delay normal exit.
        setTimeout(checkParent, 250).unref();
        return;
      }
      if (process.platform === "win32") {
        const killer = spawn(
          "taskkill.exe",
          ["/PID", String(process.pid), "/T", "/F"],
          {
            stdio: "ignore",
            windowsHide: true,
            detached: true,
          },
        );
        killer.on("error", () => process.exit(1));
        killer.unref();
        setTimeout(() => process.exit(1), 1000).unref();
      } else {
        try {
          process.kill(0, "SIGTERM");
        } catch {
          process.exit(1);
        }
      }
    };
    setTimeout(checkParent, 200).unref();
  });
}
