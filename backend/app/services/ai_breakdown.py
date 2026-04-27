from typing import Optional


def generate_task_breakdown(prompt: str) -> list[dict[str, Optional[str]]]:
    # Placeholder for future LLM provider integration.
    base = prompt.strip() or "Task"
    return [
        {"title": f"Plan: {base}", "description": "Define scope and acceptance criteria."},
        {"title": f"Build: {base}", "description": "Implement core logic and update tests."},
        {"title": f"Ship: {base}", "description": "Review, deploy, and monitor post-release."},
    ]
