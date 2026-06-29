from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

from .agents import extract_keywords, generate_source_guide, make_id
from .schemas import Source, SourceChunk, YnuImportLectureRequest


YNU_BASE = "https://course.ynu.edu.cn"
YNU_AUTH_URL = "https://ids.ynu.edu.cn/authserver/login?service=https://course.ynu.edu.cn/unifiedlogin/v1/cas/login"


class YnuAuthError(RuntimeError):
    pass


class _LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.action = ""
        self.fields: dict[str, str] = {}
        self._in_form = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key: value or "" for key, value in attrs}
        if tag == "form" and ("login" in (data.get("id", "") + data.get("name", "") + data.get("action", "")).lower()):
            self._in_form = True
            self.action = data.get("action", "")
        if tag == "input" and (self._in_form or data.get("name") in {"lt", "execution", "_eventId"}):
            name = data.get("name", "")
            if name:
                self.fields[name] = data.get("value", "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "form" and self._in_form:
            self._in_form = False


@dataclass
class YnuTranscriptSegment:
    text: str
    start: str = ""
    end: str = ""


class YnuClient:
    def __init__(self, cookie_header: str | None = None) -> None:
        self.cookie_header = (cookie_header or "").strip()
        self.cookie_jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookie_jar))

    def login(self, username: str, password: str) -> None:
        html, final_url = self.request_text(YNU_AUTH_URL)
        parser = _LoginFormParser()
        parser.feed(html)
        fields = dict(parser.fields)
        fields.update(
            {
                "username": username,
                "password": password,
                "_eventId": fields.get("_eventId") or "submit",
                "geolocation": fields.get("geolocation") or "",
            }
        )
        action = urljoin(final_url, parser.action or YNU_AUTH_URL)
        response_text, response_url = self.request_text(
            action,
            method="POST",
            data=fields,
            headers={"Referer": final_url},
        )
        if "authserver/login" in response_url and re.search(r'name=["\']password["\']', response_text):
            raise YnuAuthError("统一认证登录未通过，可能需要验证码/二次验证，或用户名密码不正确。")

    def list_courses(
        self,
        query: str | None = None,
        school_year: str | None = None,
        semester: str | None = None,
        page: int = 1,
        size: int = 12,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "type": 1,
            "page": max(page, 1),
            "size": min(max(size, 1), 50),
            "orderBy": "join_time",
            "isDesc": "true",
        }
        if query:
            params["courseName"] = query
        if school_year:
            params["schoolYear"] = school_year
        if semester:
            params["semester"] = semester
        data = self.request_json(f"{YNU_BASE}/learn/v1/course/video/review/have/role", params=params)
        return [normalize_course(item) for item in find_dict_list(data) if looks_like_course(item)]

    def fetch_video_detail(self, record_id: str) -> dict[str, Any]:
        try:
            data = self.request_json(f"{YNU_BASE}/rman/v1/entity/base/{record_id}")
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def fetch_lecture_transcripts(self, request: YnuImportLectureRequest) -> tuple[list[YnuTranscriptSegment], dict[str, Any]]:
        candidates = self.resolve_transcript_targets(request)
        segments: list[YnuTranscriptSegment] = []
        used_targets: list[dict[str, Any]] = []
        seen_segments: set[tuple[str, str]] = set()
        for target in candidates:
            content_id = str(target.get("content_id") or "").strip()
            if not content_id:
                continue
            try:
                target_segments = self.fetch_transcript(content_id)
            except Exception:
                continue
            if target_segments:
                for segment in target_segments:
                    signature = (segment.start, segment.text)
                    if signature in seen_segments:
                        continue
                    seen_segments.add(signature)
                    segments.append(segment)
                used_targets.append(target)
        if segments:
            return segments, {"resolved_targets": candidates, "used_targets": used_targets}
        raise RuntimeError("未获取到课堂语音转写文本，请确认该直录播已生成“语音文本”。")

    def resolve_transcript_targets(self, request: YnuImportLectureRequest) -> list[dict[str, Any]]:
        targets: list[dict[str, Any]] = []
        if request.record_id:
            targets.append({"content_id": request.record_id, "source": "record_id"})
        info = self.fetch_recording_info(request)
        targets.extend(self.targets_from_recording_info(info, request))
        targets.extend(self.targets_from_video_page(request))
        return dedupe_targets(targets)

    def fetch_transcript(self, content_id: str) -> list[YnuTranscriptSegment]:
        vtt_segments = self.fetch_webvtt_transcript(content_id)
        if vtt_segments:
            return vtt_segments
        payloads = [
            {"contentId": content_id},
            {"contentid": content_id},
            {"id": content_id},
            {"entityId": content_id},
            {"videoId": content_id},
        ]
        last_data: Any = None
        for payload in payloads:
            try:
                data = self.request_json(f"{YNU_BASE}/rman/v1/smart/voice/select", method="POST", json_body=payload)
            except Exception:
                continue
            last_data = data
            segments = normalize_transcript(data)
            if segments:
                return segments
        segments = normalize_transcript(last_data)
        if segments:
            return segments
        raise RuntimeError(f"contentId {content_id} 未获取到课堂语音转写文本。")

    def fetch_webvtt_transcript(self, content_id: str) -> list[YnuTranscriptSegment]:
        for lang in ("zh", "zh-CN", "en"):
            try:
                text, _ = self.request_text(
                    f"{YNU_BASE}/rman/v1/search/webvtt",
                    params={"contentId": content_id, "voice": "true", "isSysAuth": "true", "lang": lang},
                )
            except Exception:
                continue
            segments = parse_webvtt(text)
            if segments:
                return segments
        return []

    def fetch_recording_info(self, request: YnuImportLectureRequest) -> dict[str, Any]:
        params = {
            "courseId": request.course_id,
            "id": request.record_id,
            "schoolYear": request.school_year,
            "semester": request.semester,
        }
        try:
            data = self.request_json(
                f"{YNU_BASE}/learn/v1/course/recording/video/info",
                params={key: value for key, value in params.items() if value},
            )
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def targets_from_recording_info(self, info: dict[str, Any], request: YnuImportLectureRequest) -> list[dict[str, Any]]:
        data = info.get("data") if isinstance(info.get("data"), dict) else info
        weeks = data.get("recordingVideoInfoShows") or data.get("weekList") or data.get("recordingVideoInfoShowList") or []
        if not isinstance(weeks, list):
            return []
        course_info = data.get("courseInfo") if isinstance(data.get("courseInfo"), dict) else {}
        course_number = first_value(course_info, "courseNumber", "courseNo", "courseId") or first_value(data, "courseNumber", "courseNo")
        serial_number = first_value(course_info, "serialNumber", "courseNo") or first_value(data, "serialNumber", "courseNo")
        targets: list[dict[str, Any]] = []
        for week in weeks:
            if not isinstance(week, dict):
                continue
            week_value = first_value(week, "week")
            sections = week.get("recordInfoDetailList") or week.get("sections") or []
            if not isinstance(sections, list):
                continue
            for section in sections:
                if not isinstance(section, dict):
                    continue
                if not section_matches_request(week, section, request):
                    continue
                targets.extend(self.targets_from_section(section, week_value, course_number, serial_number))
        return targets

    def targets_from_section(
        self,
        section: dict[str, Any],
        week_value: Any,
        course_number: Any,
        serial_number: Any,
    ) -> list[dict[str, Any]]:
        videos = section.get("videoInfoList") or []
        if not isinstance(videos, list):
            return []
        targets: list[dict[str, Any]] = []
        schedule_ids = [first_value(video, "scheduleId", "schedule_id") for video in videos if isinstance(video, dict)]
        schedule_ids = [item for item in schedule_ids if item]
        related = self.fetch_related_videos(section, week_value, course_number, serial_number, schedule_ids)
        if not related:
            related = [video for video in videos if isinstance(video, dict)]
        file_infos = self.fetch_file_infos([first_value(item, "contentId_", "contentId", "source_contentId", "videoId") for item in related if isinstance(item, dict)])
        for item in related:
            if not isinstance(item, dict):
                continue
            raw_id = first_value(item, "contentId_", "contentId", "source_contentId", "videoId")
            file_info = file_infos.get(str(raw_id or ""), {})
            content_id = first_value(file_info, "contentId", "id") or raw_id
            download_address = first_download_address(file_info)
            content_id = content_id or content_id_from_url(download_address)
            if not content_id:
                continue
            targets.append(
                {
                    "content_id": str(content_id),
                    "source_content_id": str(first_value(item, "source_contentId") or ""),
                    "name": str(first_value(item, "seat", "videoName", "name") or ""),
                    "week": str(week_value or ""),
                    "week_day": str(first_value(section, "weekDay") or ""),
                    "section": str(first_value(section, "section", "realSection") or ""),
                    "schedule_id": str(first_value(item, "schedule_id", "scheduleId") or ""),
                    "download_address": download_address,
                    "source": "recording_info",
                }
            )
        return targets

    def fetch_related_videos(
        self,
        section: dict[str, Any],
        week_value: Any,
        course_number: Any,
        serial_number: Any,
        schedule_ids: list[Any],
    ) -> list[dict[str, Any]]:
        if not schedule_ids:
            return []
        payload = {
            "courseId": course_number,
            "courseNo": serial_number,
            "week": week_value,
            "weekDay": first_value(section, "weekDay"),
            "section": first_value(section, "section", "realSection"),
            "scheduleIds": schedule_ids,
            "isGetCut": True,
        }
        for url, body in (
            (f"{YNU_BASE}/rman/v1/search/new/relation/videos", payload),
            (f"{YNU_BASE}/rman/v1/search/relation/videos", schedule_ids),
        ):
            try:
                data = self.request_json(url, method="POST", json_body=body)
            except Exception:
                continue
            rows = find_dict_list(data)
            if rows:
                return rows
        return []

    def fetch_file_infos(self, content_ids: list[Any]) -> dict[str, dict[str, Any]]:
        ids = [str(item) for item in content_ids if item]
        if not ids:
            return {}
        try:
            data = self.request_json(f"{YNU_BASE}/rman/v1/entity/download/fileinfo", method="POST", json_body=ids)
        except Exception:
            return {}
        rows = find_dict_list(data)
        result: dict[str, dict[str, Any]] = {}
        for raw_id, row in zip(ids, rows):
            if isinstance(row, dict):
                result[raw_id] = row
        return result

    def targets_from_video_page(self, request: YnuImportLectureRequest) -> list[dict[str, Any]]:
        url = request.url or lecture_url(request.course_id, request.record_id, request.school_year, request.semester)
        try:
            html, _ = self.request_text(url, headers={"Referer": YNU_BASE})
        except Exception:
            return []
        ids = [content_id_from_url(match) for match in re.findall(r'["\']([^"\']+?\.mp4[^"\']*)["\']', html)]
        ids.extend(re.findall(r"/rman/#/mindMap/([a-f0-9]{24,36})", html))
        return [{"content_id": item, "source": "video_page"} for item in ids if item]

    def request_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        method: str = "GET",
        data: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        text, _ = self.request_text(url, params=params, method=method, data=data, json_body=json_body)
        return json.loads(text)

    def request_text(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        method: str = "GET",
        data: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[str, str]:
        target = url
        if params:
            target = f"{url}?{urlencode(params)}"
        body: bytes | None = None
        request_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NetNote/0.1",
            "Accept": "application/json, text/plain, */*",
        }
        if self.cookie_header:
            request_headers["Cookie"] = self.cookie_header
        if headers:
            request_headers.update(headers)
        if json_body is not None:
            body = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
            request_headers["Content-Type"] = "application/json;charset=UTF-8"
        elif data is not None:
            body = urlencode(data).encode("utf-8")
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"
        req = Request(target, data=body, method=method, headers=request_headers)
        with self.opener.open(req, timeout=18) as response:
            raw = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="ignore"), response.geturl()


def new_session_id() -> str:
    return f"ynu_{uuid.uuid4().hex[:18]}"


def normalize_course(item: dict[str, Any]) -> dict[str, Any]:
    course_id = first_value(item, "courseId", "course_id", "courseid")
    record_id = first_value(item, "id", "recordId", "videoId", "entityId")
    name = first_value(item, "courseName", "name", "title", "coursename") or "未命名课程"
    school_year = first_value(item, "schoolYear", "school_year")
    semester = first_value(item, "semester", "term")
    week = first_value(item, "week", "weekName", "classWeek", "weekNum")
    section = first_value(item, "section", "lesson", "lessonName", "classTime", "nodeName")
    teacher = first_value(item, "teacherName", "teacher", "mainTeacherName")
    url = ""
    if course_id and record_id:
        url = f"{YNU_BASE}/learn/videoreview/{course_id}?id={record_id}"
        if school_year:
            url += f"&schoolYear={school_year}"
        if semester:
            url += f"&semester={semester}"
    return {
        "course_id": str(course_id or ""),
        "record_id": str(record_id or ""),
        "course_name": str(name),
        "title": str(first_value(item, "title", "recordName", "name") or name),
        "teacher": str(teacher or ""),
        "school_year": str(school_year or ""),
        "semester": str(semester or ""),
        "week": str(week or ""),
        "section": str(section or ""),
        "url": url,
        "raw": item,
    }


def build_source_from_lecture(client: YnuClient, request: YnuImportLectureRequest) -> Source:
    source_id = make_id("source")
    segments, transcript_meta = client.fetch_lecture_transcripts(request)
    detail = client.fetch_video_detail(request.record_id)
    title = request.title or request.course_name or first_value(detail, "name", "title", "courseName") or "云大学堂课堂录播"
    if request.week or request.section:
        title = f"{title}｜{' '.join(part for part in [request.week, request.section] if part)}"
    source_url = request.url or lecture_url(request.course_id, request.record_id, request.school_year, request.semester)
    video_url = best_video_url(transcript_meta)
    chunks = transcript_chunks(segments, source_id, str(title), request.week, request.section, source_url, video_url)
    content_length = sum(len(chunk.text) for chunk in chunks)
    return Source(
        id=source_id,
        title=str(title),
        kind="lecture",
        status="ready",
        url=source_url,
        summary=generate_source_guide(chunks, str(title)),
        extraction_status="complete" if content_length >= 800 else "partial",
        extraction_method="ynu_transcript",
        content_length=content_length,
        metadata={
            "platform": "ynu_course",
            "course_id": request.course_id,
            "record_id": request.record_id,
            "course_name": request.course_name,
            "teacher": request.teacher,
            "school_year": request.school_year,
            "semester": request.semester,
            "week": request.week,
            "section": request.section,
            "video_url": video_url,
            "video_detail": detail,
            "transcript": transcript_meta,
        },
        chunks=chunks,
    )


def transcript_chunks(
    segments: list[YnuTranscriptSegment],
    source_id: str,
    source_title: str,
    week: str | None,
    section: str | None,
    source_url: str | None = None,
    video_url: str | None = None,
    size: int = 900,
) -> list[SourceChunk]:
    chunks: list[SourceChunk] = []
    bucket: list[YnuTranscriptSegment] = []
    bucket_len = 0

    def flush() -> None:
        nonlocal bucket, bucket_len
        if not bucket:
            return
        lines = [f"[{segment.start}] {segment.text}" if segment.start else segment.text for segment in bucket]
        start = bucket[0].start
        end = bucket[-1].end or bucket[-1].start
        time_part = " - ".join(part for part in [start, end] if part)
        location_parts = [part for part in [week, section, time_part] if part]
        text = "\n".join(lines).strip()
        start_seconds = time_to_seconds(start)
        end_seconds = time_to_seconds(end)
        chunks.append(
            SourceChunk(
                id=make_id("chunk"),
                source_id=source_id,
                source_title=source_title,
                text=text,
                location=" / ".join(location_parts) or f"转写片段 {len(chunks) + 1}",
                keywords=extract_keywords(text),
                metadata={
                    "kind": "lecture",
                    "platform": "ynu_course",
                    "week": week or "",
                    "section": section or "",
                    "start_time": start,
                    "end_time": end,
                    "start_seconds": start_seconds,
                    "end_seconds": end_seconds,
                    "video_url": video_url or "",
                    "source_url": source_url or "",
                },
            )
        )
        bucket = []
        bucket_len = 0

    for segment in segments:
        text_len = len(segment.text) + len(segment.start) + 4
        if bucket and bucket_len + text_len > size:
            flush()
        bucket.append(segment)
        bucket_len += text_len
    flush()
    return chunks


def best_video_url(transcript_meta: dict[str, Any]) -> str:
    targets = transcript_meta.get("used_targets") or transcript_meta.get("resolved_targets") or []
    if not isinstance(targets, list):
        return ""
    for target in targets:
        if not isinstance(target, dict):
            continue
        url = str(target.get("download_address") or "").strip()
        if url:
            return absolute_course_url(url)
    return ""


def absolute_course_url(url: str) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return urljoin(YNU_BASE, url)


def time_to_seconds(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})", str(value))
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def normalize_transcript(data: Any) -> list[YnuTranscriptSegment]:
    if data is None:
        return []
    text_blob = collect_timestamp_text(data)
    if text_blob:
        parsed = parse_timestamp_blob(text_blob)
        if parsed:
            return parsed
    rows = [item for item in find_dict_list(data) if transcript_text(item)]
    segments = []
    for row in rows:
        text = transcript_text(row)
        if not text:
            continue
        segments.append(YnuTranscriptSegment(text=text, start=normalize_time(first_value(row, *START_KEYS)), end=normalize_time(first_value(row, *END_KEYS))))
    return segments


TEXT_KEYS = ("text", "content", "sentence", "voiceText", "asrText", "onebest", "words", "result", "value")
START_KEYS = ("start", "startTime", "beginTime", "bg", "from", "time", "timestamp", "offset", "start_time")
END_KEYS = ("end", "endTime", "finishTime", "ed", "to", "end_time")


def transcript_text(row: dict[str, Any]) -> str:
    value = first_value(row, *TEXT_KEYS)
    if isinstance(value, list):
        value = " ".join(str(item) for item in value)
    return re.sub(r"\s+", " ", str(value or "")).strip()


def collect_timestamp_text(data: Any) -> str:
    if isinstance(data, str) and re.search(r"\d{1,2}:\d{2}:\d{2}", data):
        return data
    if isinstance(data, dict):
        for value in data.values():
            text = collect_timestamp_text(value)
            if text:
                return text
    if isinstance(data, list):
        merged = "\n".join(collect_timestamp_text(item) for item in data)
        return merged if re.search(r"\d{1,2}:\d{2}:\d{2}", merged) else ""
    return ""


def parse_timestamp_blob(text: str) -> list[YnuTranscriptSegment]:
    matches = list(re.finditer(r"(?P<time>\d{1,2}:\d{2}:\d{2})(?P<text>.*?)(?=\d{1,2}:\d{2}:\d{2}|$)", text, flags=re.S))
    segments = []
    for index, match in enumerate(matches):
        content = re.sub(r"\s+", " ", match.group("text")).strip(" ：:-\t\r\n")
        if not content:
            continue
        end = matches[index + 1].group("time") if index + 1 < len(matches) else ""
        segments.append(YnuTranscriptSegment(text=content, start=match.group("time"), end=end))
    return segments


def parse_webvtt(text: str) -> list[YnuTranscriptSegment]:
    if not text or "-->" not in text:
        return []
    segments: list[YnuTranscriptSegment] = []
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").replace("\r", "\n"))
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        time_index = next((index for index, line in enumerate(lines) if "-->" in line), -1)
        if time_index < 0:
            continue
        start_raw, end_raw = [part.strip() for part in lines[time_index].split("-->", 1)]
        content = re.sub(r"<[^>]+>", "", " ".join(lines[time_index + 1 :])).strip()
        content = re.sub(r"\s+", " ", content)
        if content:
            segments.append(
                YnuTranscriptSegment(
                    text=content,
                    start=normalize_time(start_raw),
                    end=normalize_time(end_raw.split()[0]),
                )
            )
    return segments


def find_dict_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        dict_items = [item for item in data if isinstance(item, dict)]
        if dict_items:
            return dict_items
        nested: list[dict[str, Any]] = []
        for item in data:
            nested.extend(find_dict_list(item))
        return nested
    if isinstance(data, dict):
        for key in ("records", "list", "rows", "items", "data", "result"):
            if key in data:
                found = find_dict_list(data[key])
                if found:
                    return found
        for value in data.values():
            found = find_dict_list(value)
            if found:
                return found
    return []


def looks_like_course(item: dict[str, Any]) -> bool:
    return bool(first_value(item, "courseId", "course_id", "courseid")) and bool(first_value(item, "id", "recordId", "videoId", "entityId"))


def dedupe_targets(targets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for target in targets:
        content_id = str(target.get("content_id") or "").strip()
        if not content_id or content_id in seen:
            continue
        seen.add(content_id)
        result.append(target)
    return result


def section_matches_request(week: dict[str, Any], section: dict[str, Any], request: YnuImportLectureRequest) -> bool:
    if request.week:
        week_text = str(first_value(week, "week", "weekName", "classWeek") or "")
        if request.week not in week_text and week_text not in request.week:
            return False
    if request.section:
        section_text = str(first_value(section, "section", "realSection", "lessonName", "classTime") or "")
        if request.section not in section_text and section_text not in request.section:
            return False
    return True


def first_value(data: dict[str, Any], *keys: str) -> Any:
    lower_map = {key.lower(): value for key, value in data.items()}
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
        value = lower_map.get(key.lower())
        if value not in (None, ""):
            return value
    return None


def first_download_address(data: dict[str, Any]) -> str:
    value = first_value(data, "downloadAddress", "download_address", "url", "videoUrl", "path")
    if isinstance(value, list):
        return str(value[0] if value else "")
    return str(value or "")


def content_id_from_url(url: str | None) -> str:
    if not url:
        return ""
    path = urlparse(str(url)).path
    filename = path.rsplit("/", 1)[-1]
    match = re.search(r"([a-f0-9]{24,36})(?:_filemerge)?\.(?:mp4|m3u8|flv)$", filename, flags=re.I)
    return match.group(1) if match else ""


def normalize_time(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, (int, float)):
        seconds = int(value / 1000) if value > 100000 else int(value)
        return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"
    text = str(value).strip()
    match = re.search(r"\d{1,2}:\d{2}:\d{2}", text)
    if match:
        return match.group(0)
    match = re.search(r"(\d{1,2}):(\d{2}):(\d{2})[.,]\d+", text)
    if match:
        return ":".join(part.zfill(2) for part in match.groups())
    if text.isdigit():
        return normalize_time(int(text))
    return text


def lecture_url(course_id: str, record_id: str, school_year: str | None, semester: str | None) -> str:
    url = f"{YNU_BASE}/learn/videoreview/{course_id}?id={record_id}"
    if school_year:
        url += f"&schoolYear={school_year}"
    if semester:
        url += f"&semester={semester}"
    return url
