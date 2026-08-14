// dsh-set-aumid.exe — writes System.AppUserModel.ID (PKEY_AppUserModel_ID)
// onto a .lnk shortcut through the canonical IShellLink → IPropertyStore
// path. Windows 11 no longer exposes this property through Shell.Application
// COM or Set-ItemProperty, and SHGetPropertyStoreFromParsingName refuses the
// shortcut property store, so this tiny helper is the reliable route.
//
// Compile (Windows PowerShell 5.1 / .NET Framework 4.x csc, present on every
// Windows install):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo ^
//     /target:exe /platform:anycpu /out:assets\dsh-set-aumid.exe ^
//     assets-source\SetAumid.cs
//
// Usage: dsh-set-aumid.exe <shortcut.lnk> <AppUserModelID>
using System;
using System.Runtime.InteropServices;

internal static class Program
{
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out ushort pwHotkey);
        void SetHotkey(ushort wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010B-0000-0000-C000-000000000046")]
    private interface IPersistFile
    {
        void GetClassID(out Guid pClassID);
        [PreserveSig] int IsDirty();
        void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
        void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
        void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    private interface IPropertyStore
    {
        uint GetCount(out uint cProps);
        void GetAt(uint iProp, out PropertyKey pkey);
        void GetValue(ref PropertyKey key, out PropVariant pv);
        void SetValue(ref PropertyKey key, ref PropVariant pv);
        void Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PropertyKey
    {
        public Guid fmtid;
        public uint pid;
        public PropertyKey(Guid fmtid, uint pid)
        {
            this.fmtid = fmtid;
            this.pid = pid;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropVariant
    {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public IntPtr p;
        public int p2;
    }

    private static int Main(string[] args)
    {
        if (args.Length != 2)
        {
            Console.Error.WriteLine("usage: dsh-set-aumid <shortcut.lnk> <AppUserModelID|-read>");
            return 2;
        }
        try
        {
            var link = (IShellLinkW)new ShellLink();
            var file = (IPersistFile)link;
            // STGM_READWRITE (2): loading read-only (mode 0) makes the
            // property store read-only and Save fails with STG_E_ACCESSDENIED.
            file.Load(args[0], 2);
            var store = (IPropertyStore)link;
            var key = new PropertyKey(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 5);
            if (args[1] == "-read")
            {
                PropVariant existing = new PropVariant();
                try
                {
                    store.GetValue(ref key, out existing);
                }
                catch (COMException)
                {
                    Console.WriteLine("<empty>");
                    return 0;
                }
                if (existing.vt == 0)
                {
                    Console.WriteLine("<empty>");
                    return 0;
                }
                Console.WriteLine(Marshal.PtrToStringUni(existing.p) ?? "<null>");
                return 0;
            }
            PropVariant pv = new PropVariant();
            pv.vt = 31; // VT_LPWSTR
            pv.p = Marshal.StringToCoTaskMemUni(args[1]);
            try
            {
                store.SetValue(ref key, ref pv);
                store.Commit();
                file.Save(args[0], true);
            }
            finally
            {
                Marshal.FreeCoTaskMem(pv.p);
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }
}
