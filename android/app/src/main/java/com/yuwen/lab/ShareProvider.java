package com.yuwen.lab;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 轻量文件共享 Provider（替代 androidx FileProvider）
 * 只暴露 cache/share 目录，供分享到微信 / 企业微信使用。
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY_SUFFIX = ".fileprovider";

    @Override
    public boolean onCreate() {
        return true;
    }

    private File resolve(Uri uri) {
        // uri 形如 content://<pkg>.fileprovider/share/<name>
        String path = uri.getPath();
        if (path == null) return null;
        if (path.startsWith("/")) path = path.substring(1);
        // 只允许 cache/share 下的文件
        File base = new File(getContext().getCacheDir(), "share");
        File f = new File(base, path.replace("share/", ""));
        try {
            String canonicalBase = base.getCanonicalPath();
            String canonicalFile = f.getCanonicalPath();
            if (!canonicalFile.startsWith(canonicalBase)) return null;
        } catch (Exception e) {
            return null;
        }
        return f;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = resolve(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        File f = resolve(uri);
        if (f == null || !f.exists()) return null;
        String[] cols = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
            else row[i] = null;
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
