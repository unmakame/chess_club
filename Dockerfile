FROM python:3.12-slim
WORKDIR /club
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python","club.py","--help"]
