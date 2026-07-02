import torch
from transformers import AutoModelForImageSegmentation
from torchvision import transforms

device = "cuda" if torch.cuda.is_available() else "cpu"

# Same preprocessing used by BiRefNet
transform_image = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])

print("Loading BiRefNet model...")

model = AutoModelForImageSegmentation.from_pretrained(
    "backend/weights/BiRefNet",
    trust_remote_code=True,
    local_files_only=True
)

model.to(device)
print(device)
model.eval()

print(f"Model loaded on {device}")
# import os
# print(os.path.exists("backend/weights/BiRefNet"))