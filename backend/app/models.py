from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WatermarkPosition = Literal[
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
]
WatermarkType = Literal["single", "repeated"]
WatermarkFont = Literal["Arial", "Helvetica", "Times New Roman", "Courier", "Georgia"]
OutputQuality = Literal["compact", "economy", "balanced", "high"]


class WatermarkConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    text: str = Field(min_length=1, max_length=256)
    font: WatermarkFont = "Arial"
    fontSize: int = Field(default=32, ge=8, le=200)
    position: WatermarkPosition = "middle-center"
    angle: float = Field(default=45, ge=-180, le=180)
    color: str = Field(default="#E64610", pattern=r"^#[0-9a-fA-F]{6}$")
    opacity: float = Field(default=0.4, ge=0, le=1)
    type: WatermarkType = "single"
    spaceX: float = Field(default=20, ge=0, le=200)
    spaceY: float = Field(default=20, ge=0, le=200)
    outputQuality: OutputQuality = "compact"

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        if not value.strip() or any(ord(character) < 32 for character in value):
            raise ValueError(
                "Teks watermark tidak boleh kosong atau mengandung karakter kontrol."
            )
        return value
