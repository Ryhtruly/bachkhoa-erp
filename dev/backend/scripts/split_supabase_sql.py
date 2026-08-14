from pathlib import Path


SOURCE = Path(__file__).resolve().parents[3] / "supabase_data_bk.sql"
OUTPUT_DIR = SOURCE.parent / "supabase_import_parts"
MAX_DATA_PART_BYTES = 350_000

FIRST_DATA_MARKER = "-- Data for Name:"
POST_DATA_MARKER = "-- Name: audit_log_id_seq; Type: SEQUENCE SET;"


def write_part(path: Path, title: str, lines: list[str]) -> None:
    header = [
        f"-- {title}\n",
        "-- Run the numbered files in ascending order in Supabase SQL Editor.\n",
        "\n",
    ]
    path.write_text("".join(header + lines), encoding="utf-8")


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

    data_start = next(
        index for index, line in enumerate(lines) if line.startswith(FIRST_DATA_MARKER)
    )
    post_start = next(
        index for index, line in enumerate(lines) if line.startswith(POST_DATA_MARKER)
    )

    schema_lines = lines[:data_start]
    data_lines = lines[data_start:post_start]
    finalize_lines = lines[post_start:]

    OUTPUT_DIR.mkdir(exist_ok=True)
    write_part(
        OUTPUT_DIR / "00_schema.sql",
        "BACH KHOA ERP - Part 00: schema",
        schema_lines,
    )

    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    current_bytes = 0

    for line in data_lines:
        line_bytes = len(line.encode("utf-8"))
        if (
            current_chunk
            and current_bytes + line_bytes > MAX_DATA_PART_BYTES
            and line.startswith("INSERT INTO ")
        ):
            chunks.append(current_chunk)
            current_chunk = []
            current_bytes = 0

        current_chunk.append(line)
        current_bytes += line_bytes

    if current_chunk:
        chunks.append(current_chunk)

    for index, chunk in enumerate(chunks, start=1):
        write_part(
            OUTPUT_DIR / f"{index:02d}_data.sql",
            f"BACH KHOA ERP - Part {index:02d}: data",
            chunk,
        )

    write_part(
        OUTPUT_DIR / "99_finalize.sql",
        "BACH KHOA ERP - Part 99: constraints, indexes, triggers and RLS",
        finalize_lines,
    )

    print(f"Created {len(chunks) + 2} SQL files in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
