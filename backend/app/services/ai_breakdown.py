import json
import asyncio
from typing import Optional

from fastapi import HTTPException

from app.core.config import settings

MAX_PROMPT_LENGTH = 1000
_RETRYABLE_STATUS_CODES = {429, 503}


async def _call_gemini(client, system_instruction: str, prompt: str):
    """Call Gemini with automatic retry and model fallback for overload errors."""
    from google.genai import types

    # Try models in order of preference — 1.5 and 2.0 are retired/deprecated
    model_chain = ["gemini-2.5-flash", "gemini-2.5-pro"]

    for model in model_chain:
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return response
            except Exception as e:
                err_str = str(e).upper()
                is_overload = "503" in err_str or "UNAVAILABLE" in err_str or "OVERLOADED" in err_str
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str

                if is_overload:
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(1 * (attempt + 1)) # Exponential backoff
                        continue
                    break # Try next model
                
                if is_rate_limit:
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(2 * (attempt + 1))
                        continue
                    break # Try next model

                raise
    
    raise Exception("Gemini service is currently unavailable or rate-limited. Please try again in a few minutes.")


async def generate_task_breakdown(prompt: str) -> list[dict[str, Optional[str]]]:
    # Input validation
    if not prompt or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    if len(prompt) > MAX_PROMPT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters.")

    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured. Please add GEMINI_API_KEY to your backend .env file.")

    try:
        from google import genai
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="Gemini client is not installed. Install the backend dependencies with pip install -r requirements.txt.",
        ) from exc

    client = genai.Client(api_key=settings.gemini_api_key)

    system_instruction = """
    You are an expert product manager and technical lead. 
    Your job is to break down the user's feature request into exactly 3 to 6 distinct, actionable Kanban tasks.
    
    Return ONLY a valid JSON array of objects. 
    Each object MUST have exactly these two keys:
    - "title": A short, clear action title (e.g., "Design DB schema", "Implement auth API"). Maximum 6 words.
    - "description": A concise explanation of the scope and acceptance criteria.
    """

    try:
        response = await _call_gemini(client, system_instruction, prompt)

        text = response.text.strip()
        if not text:
            raise ValueError("AI response was empty.")

        # Fallback stripping in case Gemini ignores the response_mime_type and wraps in markdown
        if text.startswith('```json'):
            text = text[7:]
        if text.endswith('```'):
            text = text[:-3]

        text = text.strip()
        if not text:
            raise ValueError("AI response was empty after cleanup.")

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"AI response was not valid JSON: {str(e)}")

        # Ensure it's a list
        if not isinstance(parsed, list):
            if isinstance(parsed, dict) and "tasks" in parsed:
                parsed = parsed["tasks"]
            else:
                parsed = [parsed]

        # Validate structure
        if not parsed:
            raise ValueError("AI response returned no tasks.")

        if len(parsed) > 10:
            parsed = parsed[:10]  # Limit to 10 tasks max

        for i, task in enumerate(parsed):
            if not isinstance(task, dict):
                raise ValueError(f"Task {i} is not a dict: {type(task)}")
            if "title" not in task or not task.get("title"):
                raise ValueError(f"Task {i} missing or empty 'title' field.")
            if "description" not in task or not task.get("description"):
                raise ValueError(f"Task {i} missing or empty 'description' field.")

        return parsed

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid AI response: {str(e)}")
    except Exception as e:
        err_str = str(e)
        # Surface overload errors with a friendlier message
        if "503" in err_str or "UNAVAILABLE" in err_str:
            raise HTTPException(
                status_code=503,
                detail="Gemini is temporarily overloaded. Please try again in a few seconds.",
            )
        if "429" in err_str or "Resource has been exhausted" in err_str:
            raise HTTPException(
                status_code=429,
                detail="Gemini rate limit reached. Please wait a moment before trying again.",
            )
        raise HTTPException(status_code=500, detail=f"AI generation failed: {err_str}")

