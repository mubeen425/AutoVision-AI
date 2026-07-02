import io
from google import genai
from google.genai import types
from PIL import Image
import os

def blend_two_images(project_id: str, location: str, img1_bytes: bytes, img2_bytes: bytes, prompt: str, output_path: str):
    # Initialize the GenAI Client pointing to Vertex AI
    client = genai.Client(
        vertexai=True,
        project=project_id,
        location=location
    )
    
    # Load and prepare image 1
    # image1 = Image.open(img1_path)
    # img1_bytes = io.BytesIO()
    # image1.save(img1_bytes, format="PNG")
    part_image1 = types.Part.from_bytes(data=img1_bytes.getvalue(), mime_type="image/png")

    # Load and prepare image 2
    # image2 = Image.open(img2_path)
    # img2_bytes = io.BytesIO()
    # image2.save(img2_bytes, format="PNG")
    part_image2 = types.Part.from_bytes(data=img2_bytes.getvalue(), mime_type="image/png")

    # Call generate_content with both images and the textual instructions
    response = client.models.generate_content(
        model="gemini-3.1-flash-image", # Use your preferred active generation model
        contents=[
            part_image1,
            part_image2,
            prompt
        ]
    )

    # Extract and save the generated image from the response payload
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            # generated_img = Image.open(io.BytesIO(part.inline_data.data))
            # generated_img.save(output_path)
            print(f"Success! Fused image saved to {output_path}")
            return Image.open(io.BytesIO(part.inline_data.data))
    
    print("No image data found in the response candidate parts.")
    return None
# PROJECT_ID = os.getenv("VERTEX_AI_PROJECT_ID")
# LOCATION = os.getenv("VERTEX_AI_LOCATION")
# # Example Usage:
# blend_two_images(
#     project_id=PROJECT_ID,
#     location=LOCATION,
#     img1_path="backend/Images/car10.jfif",
#     img2_path="backend/Images/car_bg.jpeg",
#     prompt="""
# Using the car from the first image, place it onto the background from the second image, following these steps in order:

# 1. ANALYZE TYRE CONTACT: First, identify exactly where the car's tyres/wheels touch the ground in the original image. Use this contact line as the anchor point for placement — the car must be grounded so all tyres sit flush on the new floor, with no gap and no sinking below the surface.

# 2. CALCULATE PROPER SIZE: Estimate the car's real-world size class (compact/hatchback, sedan, SUV, etc.) from its proportions. If the car is a smaller vehicle (hatchback, compact, small sedan), scale it up more noticeably so it fills a similar visual footprint in the frame as a larger car would — small cars should look substantial and prominent, not tiny or lost in the scene. If the car is already a larger vehicle (SUV, sedan, truck), apply a moderate size increase. In all cases keep proportions realistic and undistorted, and match the new background's perspective and depth cues (floor lines, vanishing point, surrounding objects).

# 3. UNDERSTAND THE NEW BACKGROUND: Read the new background's floor plane, horizon line, and light direction. Position the car so its ground-contact line aligns naturally with the background's floor perspective, keeping the same viewing angle as the original photo (do not rotate or change the car's angle).

# 4. POSITION AWAY FROM THE BACKDROP: Place the car well forward in the scene, clearly separated from the back wall — leave a visible gap of open floor space between the car and the background wall, similar to a studio photo where the subject stands several feet in front of the backdrop, not pressed against it. The car should occupy the lower-middle portion of the frame with open floor visible behind it.

# 5. PLACE FORWARD AND CENTERED: Position the car slightly forward and centered in the frame for a strong, prominent composition, as if it's the hero subject of the shot.

# 6. ADD CONTACT SHADOW: Add a natural contact single shadow directly under the tyres where they meet the ground, consistent with the background's lighting direction.

# 7. Enlarge the car to the huge size in the picture.

# 8. Place the car very away from back wall at the center.

# 9- Lighting should be in white according to scene.
# Keep the car's color, shape, design, side and angle exactly as in the original image — do not alter, redesign, or reinterpret the vehicle specially logo. Only adjust its size, position, grounding, shadow, and reflection to fit naturally into the new background. High-resolution, photorealistic, commercial automotive photography quality.
# This image already has a car properly placed on a studio floor with a background wall behind it. Your only task is to increase the distance between the car and the back wall.

# STRICT REQUIREMENTS:
# - Move the car further forward/downward in the frame, away from the back wall, creating a noticeably larger gap of open floor space between the car and the wall than currently exists.
# - Resize the car and set it according to scene.
# - Enlarge the car to huge size in picture.
# - Do NOT change the car's angle, color,side, design, or any visual details like logo.
# - Do NOT alter the wall, floor pattern, lighting, or any other part of the background.
# - Update the shadow and reflection beneath the car so they stay correctly aligned directly under the car at its new position — do not leave them behind at the old position.
# - The car must remain fully grounded, with tyres flush on the floor, no floating or sinking.
# - Lighting on car should be in white according to scene.
# - Again I am saying enlarge the car to huge size in picture.
# The result should look like the same shot, with the car simply standing further out into the open floor area, clearly separated from the backdrop.
# """,
#     output_path="backend/Images/temp_merged_output10.png"
# )