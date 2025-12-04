## Chatbox with lightrag core to retrival UIT' master related

Tạo 1 folder chứa project
Mở terminal và thực hiện theo các bước sau:
1. clone repo
```
git clone https://github.com/PoLsss/ML-lightrag-core.git
cd ML-lightrag-core
```
2. Tạo môi trường python ảo
```
python -m venv venv

.\venv\Scripts\activate       #for win
source venv/bin/activate      #for linux
```
3. Install nessecary libraries
```
pip install -r .\requirements.txt
```
4. Set up env
```
cd LightRag
cp env.example .env
```
5.
 - Tìm file .env trong thư mục LightRag, xóa tất cả nội dung trong đó
 - Vào link gg doc: https://docs.google.com/document/d/16xjDEykmz1YuYrCSfYhQjASg_CG_itRTbk953etIiEk/edit?tab=t.0
 - Coppy tất cả nội dung ở tap "file .env" vào file .env trên -> save.

6. Quay lại terminal và chạy lệnh sau
```
docker compose up -d   #for win, phải start docker desktop trước khi chạy lệnh này
sudo docker compose up -d     #for linux
```

7. Khởi động chatbox
 - Trong thư mục LightRag, mở 1 terminal mới và chạy lệnh sau
```
python main.py
```

Kết quả demo: Hiện tại chưa upload data lên lightrag, nên sẽ không có bất kỳ thông tin nào về UIT, chỉ có vài file mẫu không liên quan để test



<img width="2326" height="794" alt="image" src="https://github.com/user-attachments/assets/852c782e-750b-4935-bbf3-9ae5816ad2cd" />


