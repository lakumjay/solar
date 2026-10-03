#!/usr/bin/env python3
"""
AT89S52 GUI Programmer for macOS (USBasp)
Supports:
- Read / Download Flash from AT89S52 to .hex / .bin file
- Write / Upload .hex / .bin / Text to AT89S52 Flash
- Chip Erase & Verify
- Live Status and Hex Memory Viewer
"""
import sys
import os
import time
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

try:
    import usb.core
    import usb.backend.libusb1
except ImportError:
    pass

USBASP_FUNC_CONNECT = 1
USBASP_FUNC_DISCONNECT = 2
USBASP_FUNC_TRANSMIT = 3
USBASP_FUNC_SETISPSCK = 10

class AT89S52Backend:
    def __init__(self):
        self.dev = None
        self.dylib_path = "/Users/jay/Library/Python/3.9/lib/python/site-packages/libusb/_platform/_macos/x64/11.6/libusb-1.0.0.dylib"

    def connect(self):
        backend = None
        if os.path.exists(self.dylib_path):
            backend = usb.backend.libusb1.get_backend(find_library=lambda x: self.dylib_path)
        self.dev = usb.core.find(idVendor=0x16c0, idProduct=0x05dc, backend=backend)
        if self.dev is None:
            raise RuntimeError("USBasp Programmer not found! Please check USB cable.")
        
        # Set ISP SCK speed
        try:
            self.dev.ctrl_transfer(0x40, USBASP_FUNC_SETISPSCK, 3, 0, 0)
        except Exception:
            pass
        self.dev.ctrl_transfer(0xC0, USBASP_FUNC_CONNECT, 0, 0, 1)
        time.sleep(0.05)
        # Enable prog
        self.spi(0xAC, 0x53, 0x00, 0x00)
        time.sleep(0.02)

    def disconnect(self):
        if self.dev:
            try:
                self.dev.ctrl_transfer(0xC0, USBASP_FUNC_DISCONNECT, 0, 0, 1)
            except Exception:
                pass

    def spi(self, b0, b1, b2, b3):
        wVal = b0 | (b1 << 8)
        wIdx = b2 | (b3 << 8)
        ret = self.dev.ctrl_transfer(0xC0, USBASP_FUNC_TRANSMIT, wVal, wIdx, 4)
        return list(ret)

    def read_signature(self):
        s0 = self.spi(0x28, 0x00, 0x00, 0x00)[3]
        s1 = self.spi(0x28, 0x01, 0x00, 0x00)[3]
        s2 = self.spi(0x28, 0x02, 0x00, 0x00)[3]
        return s0, s1, s2

    def erase_chip(self):
        self.spi(0xAC, 0x80, 0x00, 0x00)
        time.sleep(0.6)
        self.spi(0xAC, 0x53, 0x00, 0x00)
        time.sleep(0.05)

    def write_byte(self, addr, data_byte):
        self.spi(0x40, (addr >> 8) & 0x1F, addr & 0xFF, data_byte)
        time.sleep(0.005)

    def read_byte(self, addr):
        r = self.spi(0x20, (addr >> 8) & 0x1F, addr & 0xFF, 0x00)
        return r[3]

    def read_flash_block(self, start_addr, size, progress_callback=None):
        data = []
        for i in range(size):
            addr = start_addr + i
            b = self.read_byte(addr)
            data.append(b)
            if progress_callback and i % 64 == 0:
                progress_callback(i, size)
        if progress_callback:
            progress_callback(size, size)
        return data

    def write_flash_block(self, start_addr, data_bytes, progress_callback=None):
        size = len(data_bytes)
        for i, b in enumerate(data_bytes):
            addr = start_addr + i
            self.write_byte(addr, b)
            if progress_callback and i % 32 == 0:
                progress_callback(i, size)
        if progress_callback:
            progress_callback(size, size)

def save_as_hex(data, filepath):
    lines = []
    for addr in range(0, len(data), 16):
        chunk = data[addr:addr+16]
        byte_count = len(chunk)
        record_type = 0x00
        # checksum = (sum) & 0xFF -> two's complement
        chk_sum = byte_count + ((addr >> 8) & 0xFF) + (addr & 0xFF) + record_type + sum(chunk)
        chk_sum = ((~chk_sum) + 1) & 0xFF
        hex_data = "".join(f"{b:02X}" for b in chunk)
        lines.append(f":{byte_count:02X}{addr:04X}{record_type:02X}{hex_data}{chk_sum:02X}")
    lines.append(":00000001FF") # End of File
    with open(filepath, "w") as f:
        f.write("\n".join(lines) + "\n")

def parse_hex_file(filepath):
    data = {}
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line.startswith(":") or len(line) < 11:
                continue
            byte_count = int(line[1:3], 16)
            addr = int(line[3:7], 16)
            rec_type = int(line[7:9], 16)
            if rec_type == 0x00: # Data record
                for i in range(byte_count):
                    b = int(line[9 + i*2 : 11 + i*2], 16)
                    data[addr + i] = b
            elif rec_type == 0x01: # EOF
                break
    return data

class AT89S52App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("AT89S52 / 8051 USB Programmer (macOS)")
        self.geometry("780x640")
        self.minsize(700, 550)
        self.backend = AT89S52Backend()
        
        self.configure(bg="#F5F5F7")
        self.setup_ui()

    def setup_ui(self):
        style = ttk.Style()
        style.theme_use("clam")

        # Top Header Frame
        header = tk.Frame(self, bg="#1E293B", height=65)
        header.pack(fill=tk.X, side=tk.TOP)
        
        title_lbl = tk.Label(header, text="⚡ AT89S52 Microcontroller Programmer", font=("Helvetica", 17, "bold"), fg="white", bg="#1E293B")
        title_lbl.pack(side=tk.LEFT, padx=20, pady=12)
        
        self.status_badge = tk.Label(header, text="● Disconnected", font=("Helvetica", 12, "bold"), fg="#EF4444", bg="#1E293B")
        self.status_badge.pack(side=tk.RIGHT, padx=20, pady=12)

        # Main Content
        main_frame = tk.Frame(self, bg="#F5F5F7", padx=15, pady=10)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Control Buttons Bar
        btn_frame = tk.LabelFrame(main_frame, text=" Programmer Operations ", font=("Helvetica", 12, "bold"), bg="#FFFFFF", padx=10, pady=10)
        btn_frame.pack(fill=tk.X, pady=5)

        tk.Button(btn_frame, text="🔍 Check IC / Test Connection", font=("Helvetica", 11, "bold"), bg="#2563EB", fg="white", padx=12, pady=6, command=self.btn_check_connection).grid(row=0, column=0, padx=5, pady=5)
        tk.Button(btn_frame, text="📥 Download (Read IC Data)", font=("Helvetica", 11, "bold"), bg="#059669", fg="white", padx=12, pady=6, command=self.btn_download_data).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(btn_frame, text="📤 Upload (Flash .hex/.bin)", font=("Helvetica", 11, "bold"), bg="#D97706", fg="white", padx=12, pady=6, command=self.btn_upload_data).grid(row=0, column=2, padx=5, pady=5)
        tk.Button(btn_frame, text="🗑️ Erase Chip", font=("Helvetica", 11, "bold"), bg="#DC2626", fg="white", padx=12, pady=6, command=self.btn_erase_chip).grid(row=0, column=3, padx=5, pady=5)

        # Quick Test / Text write box
        quick_frame = tk.LabelFrame(main_frame, text=" Quick Text / String Flash Test ", font=("Helvetica", 11, "bold"), bg="#FFFFFF", padx=10, pady=8)
        quick_frame.pack(fill=tk.X, pady=5)

        tk.Label(quick_frame, text="Custom Text:", font=("Helvetica", 11), bg="#FFFFFF").pack(side=tk.LEFT, padx=5)
        self.text_entry = tk.Entry(quick_frame, font=("Helvetica", 12), width=35)
        self.text_entry.insert(0, "hello kem cho")
        self.text_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        tk.Button(quick_frame, text="Write Text to IC", font=("Helvetica", 10, "bold"), bg="#4F46E5", fg="white", padx=10, pady=3, command=self.btn_write_text).pack(side=tk.RIGHT, padx=5)

        # Progress bar
        prog_frame = tk.Frame(main_frame, bg="#F5F5F7")
        prog_frame.pack(fill=tk.X, pady=4)
        
        self.progress = ttk.Progressbar(prog_frame, orient="horizontal", mode="determinate")
        self.progress.pack(fill=tk.X)
        self.progress_lbl = tk.Label(prog_frame, text="Ready", font=("Helvetica", 10), bg="#F5F5F7", fg="#64748B")
        self.progress_lbl.pack(anchor="w", pady=2)

        # Terminal / Log Box
        log_frame = tk.LabelFrame(main_frame, text=" Activity Log & Memory Dump ", font=("Helvetica", 11, "bold"), bg="#FFFFFF", padx=10, pady=10)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, font=("Courier", 11), bg="#0F172A", fg="#38BDF8", insertbackground="white")
        self.log_text.pack(fill=tk.BOTH, expand=True)

        self.log("App ready. Connect your USBasp programmer and click 'Check IC / Test Connection'.")

    def log(self, msg):
        self.log_text.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n")
        self.log_text.see(tk.END)

    def set_status(self, connected, text):
        if connected:
            self.status_badge.config(text=f"● {text}", fg="#10B981")
        else:
            self.status_badge.config(text=f"● {text}", fg="#EF4444")

    def run_async(self, target):
        threading.Thread(target=target, daemon=True).start()

    def update_prog(self, current, total):
        pct = int((current / total) * 100) if total > 0 else 0
        self.progress["value"] = pct
        self.progress_lbl.config(text=f"Processing: {pct}% ({current}/{total} bytes)")
        self.update_idletasks()

    def btn_check_connection(self):
        def task():
            try:
                self.log("Connecting to USBasp Programmer...")
                self.backend.connect()
                sig = self.backend.read_signature()
                self.log(f"Device Signature Read: 0x{sig[0]:02X} 0x{sig[1]:02X} 0x{sig[2]:02X}")
                if sig[0] == 0x1E and sig[1] == 0x52:
                    self.log("✅ Success: Atmel AT89S52 Microcontroller Detected & Ready!")
                    self.set_status(True, "AT89S52 Connected")
                else:
                    self.log(f"⚠️ Connected, but signature (0x{sig[0]:02X} 0x{sig[1]:02X}) differs from AT89S52.")
                    self.set_status(True, "Chip Detected")
                self.backend.disconnect()
            except Exception as e:
                self.log(f"❌ Error: {e}")
                self.set_status(False, "Disconnected")
        self.run_async(task)

    def btn_download_data(self):
        # Read from IC and save to file (.hex or .bin)
        save_path = filedialog.asksaveasfilename(
            title="Save Microcontroller Data As",
            defaultextension=".hex",
            filetypes=[("Intel HEX File", "*.hex"), ("Binary File", "*.bin"), ("All Files", "*.*")]
        )
        if not save_path:
            return

        def task():
            try:
                self.log(f"Connecting to read AT89S52 Flash Memory...")
                self.backend.connect()
                self.log("Reading 8KB Flash memory from AT89S52...")
                
                flash_data = self.backend.read_flash_block(0x0000, 8192, self.update_prog)
                
                if save_path.endswith(".bin"):
                    with open(save_path, "wb") as f:
                        f.write(bytes(flash_data))
                else:
                    save_as_hex(flash_data, save_path)

                self.backend.disconnect()
                self.log(f"✅ SUCCESS: 8KB Flash data downloaded and saved to:\n  {save_path}")
                
                # Show first 64 bytes in log
                hex_preview = " ".join(f"{b:02X}" for b in flash_data[:64])
                self.log(f"First 64 Bytes Preview:\n{hex_preview}")
                messagebox.showinfo("Download Complete", f"Microcontroller data successfully saved to:\n{save_path}")
            except Exception as e:
                self.log(f"❌ Error downloading data: {e}")
                messagebox.showerror("Download Error", str(e))
            finally:
                self.progress["value"] = 0
                self.progress_lbl.config(text="Ready")
        self.run_async(task)

    def btn_upload_data(self):
        open_path = filedialog.askopenfilename(
            title="Select HEX or BIN File to Upload",
            filetypes=[("Hex or Bin Files", "*.hex;*.bin;*.ihx"), ("Intel HEX File", "*.hex"), ("Binary File", "*.bin"), ("All Files", "*.*")]
        )
        if not open_path:
            return

        def task():
            try:
                self.log(f"Loading file: {open_path}")
                if open_path.endswith(".hex") or open_path.endswith(".ihx"):
                    data_dict = parse_hex_file(open_path)
                    if not data_dict:
                        raise ValueError("No data found in HEX file!")
                    max_addr = max(data_dict.keys())
                    data_bytes = [data_dict.get(a, 0xFF) for a in range(max_addr + 1)]
                else:
                    with open(open_path, "rb") as f:
                        data_bytes = list(f.read())

                if len(data_bytes) > 8192:
                    raise ValueError(f"File size ({len(data_bytes)} bytes) exceeds AT89S52 Flash capacity (8192 bytes)!")

                self.log(f"Connecting to AT89S52 to write {len(data_bytes)} bytes...")
                self.backend.connect()
                
                self.log("Erasing chip before writing...")
                self.backend.erase_chip()

                self.log(f"Flashing {len(data_bytes)} bytes into AT89S52...")
                self.backend.write_flash_block(0x0000, data_bytes, self.update_prog)

                self.log("Verifying written data...")
                verify_bytes = self.backend.read_flash_block(0x0000, len(data_bytes))
                
                if verify_bytes == data_bytes:
                    self.log("✅ SUCCESS: Verification Passed! 100% data successfully programmed.")
                    messagebox.showinfo("Upload Complete", "Hex file successfully flashed and verified in AT89S52!")
                else:
                    self.log("⚠️ Verification mismatch! Please check hardware connections.")
                    messagebox.showwarning("Verification Mismatch", "Some bytes did not verify correctly.")

                self.backend.disconnect()
            except Exception as e:
                self.log(f"❌ Upload Error: {e}")
                messagebox.showerror("Upload Error", str(e))
            finally:
                self.progress["value"] = 0
                self.progress_lbl.config(text="Ready")
        self.run_async(task)

    def btn_erase_chip(self):
        if not messagebox.askyesno("Erase Chip", "Are you sure you want to completely erase the AT89S52 Flash memory?"):
            return

        def task():
            try:
                self.log("Connecting and erasing AT89S52...")
                self.backend.connect()
                self.backend.erase_chip()
                self.backend.disconnect()
                self.log("✅ Chip Erased Successfully! (All memory reset to 0xFF).")
                messagebox.showinfo("Chip Erased", "AT89S52 memory erased successfully.")
            except Exception as e:
                self.log(f"❌ Erase Error: {e}")
                messagebox.showerror("Erase Error", str(e))
        self.run_async(task)

    def btn_write_text(self):
        text = self.text_entry.get()
        if not text:
            return
        data = [ord(c) for c in text]

        def task():
            try:
                self.log(f"Connecting to write custom string: \"{text}\"...")
                self.backend.connect()
                self.backend.erase_chip()
                self.backend.write_flash_block(0x0000, data, self.update_prog)
                read_back = self.backend.read_flash_block(0x0000, len(data))
                self.backend.disconnect()
                read_str = "".join(chr(b) for b in read_back)
                self.log(f"Read-back: \"{read_str}\"")
                if read_str == text:
                    self.log(f"✅ Text \"{text}\" successfully written and verified!")
                    messagebox.showinfo("Success", f"Text \"{text}\" successfully written and verified in AT89S52!")
                else:
                    self.log("⚠️ Verification mismatch.")
            except Exception as e:
                self.log(f"❌ Error: {e}")
            finally:
                self.progress["value"] = 0
                self.progress_lbl.config(text="Ready")
        self.run_async(task)

if __name__ == "__main__":
    app = AT89S52App()
    app.mainloop()
