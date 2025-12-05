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
or
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
or
sudo docker compose up -d     #for linux
```
- Sau khi chạy 1 lúc (khoảng 10s) thì có thể truy cập vào webui của lightrag bằng địa chỉ: http://localhost:9621/webui/
- Giao diện sẽ như sau, tại đậy có thể upload thủ công 1 số file để test với chatbox

<img width="2774" height="837" alt="image" src="https://github.com/user-attachments/assets/9b01aec0-9626-48c1-9196-e7091975dd09" />


7. Khởi động chatbox
 - Trong thư mục ML-lightrag-core, mở 1 terminal mới và chạy lệnh sau
```
.\venv\Scripts\activate       #for win
or
source venv/bin/activate      #for linux

python main.py
```
Chưa hỗ trợ upload file tự động.
Kết quả demo: Hiện tại chỉ mới upload file "cam_nang_sau_dai_hoc_2025_0.pdf" từ trang 1-43, nên sẽ có rất it thông tin nào về UIT, chỉ có vài file mẫu không liên quan để test



<img width="2326" height="794" alt="image" src="https://github.com/user-attachments/assets/852c782e-750b-4935-bbf3-9ae5816ad2cd" />


