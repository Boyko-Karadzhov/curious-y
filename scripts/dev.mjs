import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

function childCommand(command, args) {
    if (!isWindows) return [command, args];
    return [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')]];
}

function run(command, args, stdio = 'inherit') {
    const [executable, argv] = childCommand(command, args);
    const result = spawnSync(executable, argv, { stdio, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}).`);
    return result.stdout ?? '';
}

function localViteEnv(output) {
    const rows = output.split(/\r?\n/)
        .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
        .filter(Boolean);
    const values = Object.fromEntries(rows.map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]));
    if (!values.API_URL || !values.ANON_KEY) {
        throw new Error('Supabase status did not provide API_URL and ANON_KEY.');
    }
    return {
        ...process.env,
        VITE_SUPABASE_URL: values.API_URL,
        VITE_SUPABASE_ANON_KEY: values.ANON_KEY,
    };
}

function launch(command, args, env = process.env) {
    const [executable, argv] = childCommand(command, args);
    return spawn(executable, argv, { stdio: 'inherit', env });
}

function waitForExit(child) {
    return new Promise((resolve) => {
        child.once('exit', (code) => resolve(code ?? 1));
        child.once('error', (error) => {
            console.error(error);
            resolve(1);
        });
    });
}

function stop(child) {
    if (!child.pid || child.exitCode !== null) return;
    if (isWindows) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
        child.kill('SIGTERM');
    }
}

async function main() {
    run('supabase', ['start']);
    const viteEnv = localViteEnv(run('supabase', ['status', '-o', 'env'], 'pipe'));
    const edge = launch('supabase', ['functions', 'serve', '--inspect-mode', 'brk']);
    const frontend = launch('vite', [], viteEnv);
    const halt = () => {
        stop(edge);
        stop(frontend);
    };
    process.once('SIGINT', halt);
    process.once('SIGTERM', halt);
    process.exitCode = await Promise.race([waitForExit(edge), waitForExit(frontend)]);
    halt();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
