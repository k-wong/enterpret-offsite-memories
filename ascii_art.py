#!/usr/bin/env python3
"""
Generic image -> ASCII art converter.

Usage:
  python ascii_art.py input.jpg -o output.txt --width 220
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


REFERENCE_CHARSET = "@%#|Oac:*+=-._"
DEFAULT_CHARSET = REFERENCE_CHARSET
BLOCK_CHARSET = REFERENCE_CHARSET
RESAMPLE_MAP = {
    "nearest": Image.Resampling.NEAREST,
    "bilinear": Image.Resampling.BILINEAR,
    "bicubic": Image.Resampling.BICUBIC,
    "lanczos": Image.Resampling.LANCZOS,
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _load_text(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def _validate_reference_charset(charset: str) -> None:
    invalid_chars = sorted(set(charset) - set(REFERENCE_CHARSET))
    if invalid_chars:
        raise ValueError(
            "Only REFERENCE_CHARSET characters are allowed. "
            f"Invalid characters: {''.join(invalid_chars)!r}"
        )


def _image_to_ascii(
    img: Image.Image,
    width: int = 240,
    height: Optional[int] = None,
    charset: str = DEFAULT_CHARSET,
    invert: bool = False,
    contrast: float = 1.15,
    brightness: float = 1.0,
    gamma: float = 1.0,
    edge_boost: float = 0.0,
    scale_y: float = 0.5,
    autocontrast: bool = True,
    quantize_mode: str = "round",
    resample: str = "lanczos",
) -> str:
    if width < 8:
        raise ValueError("width must be >= 8")
    if len(charset) < 2:
        raise ValueError("charset must contain at least 2 characters")
    _validate_reference_charset(charset)

    if quantize_mode not in {"round", "floor"}:
        raise ValueError("quantize_mode must be one of: round, floor")
    if resample not in RESAMPLE_MAP:
        raise ValueError("resample must be one of: nearest, bilinear, bicubic, lanczos")

    img = img.convert("L")

    # Resize while accounting for character cell proportions.
    src_w, src_h = img.size
    target_w = width
    if height is not None:
        target_h = max(1, height)
    else:
        target_h = max(1, int((src_h / src_w) * target_w * scale_y))
    img = img.resize((target_w, target_h), RESAMPLE_MAP[resample])

    # Global tone controls.
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if gamma != 1.0:
        inv_gamma = 1.0 / _clamp(gamma, 0.1, 5.0)
        lut = [int((i / 255.0) ** inv_gamma * 255.0) for i in range(256)]
        img = img.point(lut)

    if autocontrast:
        # Autocontrast can help normalize mixed lighting scenes.
        img = ImageOps.autocontrast(img)

    # Optional edge enhancement (blends in gradient magnitude).
    if edge_boost > 0:
        edge_boost = _clamp(edge_boost, 0.0, 3.0)
        edges = img.filter(ImageFilter.FIND_EDGES)
        img = Image.blend(img, edges, alpha=min(0.85, edge_boost / 3.0))

    pixels = list(img.getdata())
    if invert:
        pixels = [255 - p for p in pixels]

    n = len(charset) - 1
    chars = []
    for p in pixels:
        scaled = (p / 255.0) * n
        idx = round(scaled) if quantize_mode == "round" else int(scaled)
        idx = max(0, min(n, idx))
        chars.append(charset[idx])

    lines = []
    for i in range(0, len(chars), target_w):
        lines.append("".join(chars[i : i + target_w]))

    return "\n".join(lines)


def image_to_ascii(
    image_path: str | Path,
    width: int = 240,
    height: Optional[int] = None,
    charset: str = DEFAULT_CHARSET,
    invert: bool = False,
    contrast: float = 1.15,
    brightness: float = 1.0,
    gamma: float = 1.0,
    edge_boost: float = 0.0,
    scale_y: float = 0.5,
    autocontrast: bool = True,
    quantize_mode: str = "round",
    resample: str = "lanczos",
) -> str:
    """
    Convert an image to ASCII art text.

    Args:
        image_path: Input image path.
        width: Output width in characters.
        height: Explicit output height in characters. Overrides scale_y.
        charset: Characters ordered from darkest to lightest.
        invert: If True, invert luminance mapping.
        contrast: Contrast multiplier (1.0 keeps original).
        brightness: Brightness multiplier (1.0 keeps original).
        gamma: Gamma correction (>1 darkens mids, <1 lightens mids).
        edge_boost: 0..3 rough edge emphasis for detail.
        scale_y: Character aspect ratio correction factor.
        autocontrast: If True, apply autocontrast normalization.
        quantize_mode: "round" or "floor" luminance quantization.
        resample: Resize kernel (nearest, bilinear, bicubic, lanczos).
    """
    img = Image.open(image_path)
    return _image_to_ascii(
        img=img,
        width=width,
        height=height,
        charset=charset,
        invert=invert,
        contrast=contrast,
        brightness=brightness,
        gamma=gamma,
        edge_boost=edge_boost,
        scale_y=scale_y,
        autocontrast=autocontrast,
        quantize_mode=quantize_mode,
        resample=resample,
    )


def video_to_ascii_frames(
    video_path: str | Path,
    frames_per_second: float = 8.0,
    total_output_frames: int = 32,
    width: int = 240,
    height: Optional[int] = None,
    charset: str = DEFAULT_CHARSET,
    invert: bool = False,
    contrast: float = 1.15,
    brightness: float = 1.0,
    gamma: float = 1.0,
    edge_boost: float = 0.0,
    scale_y: float = 0.5,
    autocontrast: bool = True,
    quantize_mode: str = "round",
    resample: str = "lanczos",
    output_dir: str | Path | None = None,
    frame_prefix: str = "frame",
) -> list[str]:
    """
    Convert a video clip into sampled ASCII frames starting from t=0.

    Args:
        video_path: Path to an input video file.
        frames_per_second: Sampling FPS from the beginning of the clip.
        total_output_frames: Maximum number of ASCII frames to return.
        output_dir: Optional directory to save per-frame .txt outputs.
        frame_prefix: Prefix used when saving frame files.
    """
    if frames_per_second <= 0:
        raise ValueError("frames_per_second must be > 0")
    if total_output_frames <= 0:
        raise ValueError("total_output_frames must be > 0")

    try:
        import imageio.v2 as imageio
    except ImportError as exc:
        raise ImportError(
            "video_to_ascii_frames requires imageio and imageio-ffmpeg. "
            "Install with: python3 -m pip install imageio imageio-ffmpeg"
        ) from exc

    reader = imageio.get_reader(str(video_path), "ffmpeg")
    ascii_frames: list[str] = []
    try:
        metadata = reader.get_meta_data()
        source_fps = float(metadata.get("fps", 0.0) or 0.0)
        step = (source_fps / frames_per_second) if source_fps > 0 else 1.0

        for output_index in range(total_output_frames):
            frame_index = int(round(output_index * step))
            try:
                frame_array = reader.get_data(frame_index)
            except IndexError:
                break

            frame_img = Image.fromarray(frame_array)
            ascii_art = _image_to_ascii(
                img=frame_img,
                width=width,
                height=height,
                charset=charset,
                invert=invert,
                contrast=contrast,
                brightness=brightness,
                gamma=gamma,
                edge_boost=edge_boost,
                scale_y=scale_y,
                autocontrast=autocontrast,
                quantize_mode=quantize_mode,
                resample=resample,
            )
            ascii_frames.append(ascii_art)
    finally:
        reader.close()

    if output_dir is not None:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        for i, frame in enumerate(ascii_frames):
            save_ascii(frame, output_path / f"{frame_prefix}_{i:04d}.txt")

    return ascii_frames


def save_ascii(ascii_art: str, output_path: str | Path) -> None:
    Path(output_path).write_text(ascii_art, encoding="utf-8")


def save_ascii_js(ascii_art: str, output_path: str | Path, variable_name: str = "BEACH_ASCII") -> None:
    escaped = ascii_art.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    js = (
        "// Generated by ascii_art.py\n"
        f"window.{variable_name} = `{escaped}`;\n"
    )
    Path(output_path).write_text(js, encoding="utf-8")


def save_ascii_frames_js(
    frames: list[str],
    output_path: str | Path,
    variable_name: str = "ASCII_VIDEO_FRAMES",
) -> None:
    escaped_frames = [
        frame.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
        for frame in frames
    ]
    lines = ["// Generated by ascii_art.py", f"window.{variable_name} = ["]
    lines.extend([f"  `{frame}`," for frame in escaped_frames])
    lines.append("];")
    Path(output_path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert image to ASCII art.")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("-o", "--output", help="Output text file path")
    parser.add_argument("-w", "--width", type=int, default=240, help="ASCII width in characters")
    parser.add_argument("--height", type=int, help="ASCII height in characters (overrides scale-y)")
    parser.add_argument(
        "--charset",
        default=REFERENCE_CHARSET,
        help="Dark->light chars. Must use only characters from REFERENCE_CHARSET.",
    )
    parser.add_argument("--preset", choices=["reference"], default="reference")
    parser.add_argument(
        "--profile",
        choices=["default", "reference"],
        default="default",
        help="Optional parameter bundle. 'reference' targets your sample style.",
    )
    parser.add_argument("--invert", action="store_true", help="Invert dark/light mapping")
    parser.add_argument("--contrast", type=float, default=1.15, help="Contrast multiplier")
    parser.add_argument("--brightness", type=float, default=1.0, help="Brightness multiplier")
    parser.add_argument("--gamma", type=float, default=1.0, help="Gamma correction")
    parser.add_argument("--edge-boost", type=float, default=0.0, help="Edge emphasis 0..3")
    parser.add_argument("--autocontrast", action="store_true", default=True, help="Enable autocontrast")
    parser.add_argument("--no-autocontrast", dest="autocontrast", action="store_false", help="Disable autocontrast")
    parser.add_argument("--quantize", choices=["round", "floor"], default="round", help="Luminance quantization mode")
    parser.add_argument(
        "--resample",
        choices=["nearest", "bilinear", "bicubic", "lanczos"],
        default="lanczos",
        help="Image resize kernel",
    )
    parser.add_argument(
        "--scale-y",
        type=float,
        default=0.5,
        help="Height correction factor for character aspect ratio",
    )
    parser.add_argument(
        "--compare-to",
        help="Optional expected ASCII file path. Prints exact character match ratio.",
    )
    parser.add_argument(
        "--fit-reference",
        help=(
            "Path to expected ASCII text. Runs an automatic web-style parameter search "
            "and prints the best reproducible settings."
        ),
    )
    parser.add_argument("--print", action="store_true", help="Print ASCII art to terminal")
    parser.add_argument(
        "--output-js",
        help="Optional JS output path that writes window.BEACH_ASCII for static sites.",
    )
    return parser


def _similarity(a: str, b: str) -> float:
    total = max(len(a), len(b))
    if total == 0:
        return 1.0
    min_len = min(len(a), len(b))
    matches = sum(1 for i in range(min_len) if a[i] == b[i])
    return matches / total


def _fit_against_reference(args: argparse.Namespace) -> tuple[dict, str, float, float]:
    expected = _load_text(args.fit_reference)
    expected_lines = expected.splitlines()
    if not expected_lines:
        raise ValueError("fit-reference file is empty")

    target_w = len(expected_lines[0])
    target_h = len(expected_lines)

    # Search space mirrors screenshot controls from the referenced generator.
    candidate_charsets = [REFERENCE_CHARSET]
    candidate_resamples = ["nearest", "bilinear", "bicubic", "lanczos"]
    candidate_quant = ["floor", "round"]
    candidate_ac = [False, True]
    candidate_contrast = [0.95, 1.0, 1.05]
    candidate_brightness = [0.95, 1.0, 1.05]
    candidate_gamma = [0.95, 1.0, 1.05]
    candidate_edge = [0.0, 0.1]

    best: Optional[tuple[float, float, dict, str]] = None
    for charset in candidate_charsets:
        for resample in candidate_resamples:
            for quantize in candidate_quant:
                for ac in candidate_ac:
                    for contrast in candidate_contrast:
                        for brightness in candidate_brightness:
                            for gamma in candidate_gamma:
                                for edge_boost in candidate_edge:
                                    ascii_art = image_to_ascii(
                                        image_path=args.input,
                                        width=target_w,
                                        height=target_h,
                                        charset=charset,
                                        invert=False,
                                        contrast=contrast,
                                        brightness=brightness,
                                        gamma=gamma,
                                        edge_boost=edge_boost,
                                        scale_y=args.scale_y,
                                        autocontrast=ac,
                                        quantize_mode=quantize,
                                        resample=resample,
                                    )
                                    exact = _similarity(ascii_art, expected)
                                    prefix_len = min(300, len(expected), len(ascii_art))
                                    prefix = (
                                        _similarity(ascii_art[:prefix_len], expected[:prefix_len])
                                        if prefix_len > 0
                                        else 1.0
                                    )
                                    config = {
                                        "width": target_w,
                                        "height": target_h,
                                        "charset": charset,
                                        "resample": resample,
                                        "quantize": quantize,
                                        "autocontrast": ac,
                                        "contrast": contrast,
                                        "brightness": brightness,
                                        "gamma": gamma,
                                        "edge_boost": edge_boost,
                                    }
                                    row = (exact, prefix, config, ascii_art)
                                    if best is None or row[:2] > best[:2]:
                                        best = row

    assert best is not None
    exact, prefix, config, ascii_art = best
    return config, ascii_art, exact, prefix


def main() -> None:
    args = _build_parser().parse_args()

    if args.fit_reference:
        config, ascii_art, exact, prefix = _fit_against_reference(args)
        print("Best fit configuration:")
        for key, value in config.items():
            print(f"  {key}: {value}")
        print(f"Exact character match: {exact:.4%}")
        print(f"Prefix match (first 300 chars): {prefix:.4%}")

        if args.output:
            save_ascii(ascii_art, args.output)
            print(f"Saved ASCII art to: {args.output}")
        if args.output_js:
            save_ascii_js(ascii_art, args.output_js)
            print(f"Saved JS ASCII data to: {args.output_js}")
        if args.print or not args.output:
            print(ascii_art)
        return

    if args.profile == "reference":
        # Calibrated to the provided Phuket sample style.
        args.width = 300
        # args.height = 89
        args.preset = "reference"
        args.scale_y = 0.5431
        args.resample = "bicubic"
        args.quantize = "floor"
        args.contrast = 1.0
        args.brightness = 1.0
        args.gamma = 1.0
        args.autocontrast = True
        args.edge_boost = 0.0
        args.invert = False

    charset = args.charset
    _validate_reference_charset(charset)

    ascii_art = image_to_ascii(
        image_path=args.input,
        width=args.width,
        height=args.height,
        charset=charset,
        invert=args.invert,
        contrast=args.contrast,
        brightness=args.brightness,
        gamma=args.gamma,
        edge_boost=args.edge_boost,
        scale_y=args.scale_y,
        autocontrast=args.autocontrast,
        quantize_mode=args.quantize,
        resample=args.resample,
    )

    if args.output:
        save_ascii(ascii_art, args.output)
        print(f"Saved ASCII art to: {args.output}")
    if args.output_js:
        save_ascii_js(ascii_art, args.output_js)
        print(f"Saved JS ASCII data to: {args.output_js}")

    if args.compare_to:
        expected = Path(args.compare_to).read_text(encoding="utf-8")
        score = _similarity(ascii_art, expected)
        print(f"Exact character match: {score:.4%}")
        if expected and ascii_art:
            print(f"Expected first 5 chars: {expected[:5]}")
            print(f"Actual first 5 chars:   {ascii_art[:5]}")

    if args.print or (not args.output and not args.output_js):
        print(ascii_art)


if __name__ == "__main__":
    main()
