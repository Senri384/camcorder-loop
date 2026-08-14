import argparse
import importlib.util
import json
from pathlib import Path

import requests


PROVIDER_SCRIPT = Path(
    r"C:\Users\vivix\Documents\Codex\2026-07-13\https-gitlab-vivix-work-link-media\media-skills"
    r"\.agent\skills\media-generation\providers\video\seedance-2-0-asset\scripts\generate.py"
)


def load_provider():
    spec = importlib.util.spec_from_file_location("seedance_asset_generate", PROVIDER_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load provider script: {PROVIDER_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_id")
    parser.add_argument("output")
    args = parser.parse_args()

    provider = load_provider()
    cfg = provider.load_config()
    final = provider.poll_task(args.task_id, cfg)
    if final.get("status") != "succeeded":
        print(json.dumps(final, ensure_ascii=False, indent=2))
        return 1

    video_url = (final.get("content") or {}).get("video_url") or final.get("video_url")
    if not video_url:
        raise RuntimeError("Succeeded task has no video URL")

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(video_url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with output.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)

    record = {
        "task_id": args.task_id,
        "video_url": video_url,
        "mp4_path": str(output),
        "recovered": True,
        "final": final,
    }
    record_path = Path.cwd() / "output" / f"{args.task_id}.json"
    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[recovered] {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
