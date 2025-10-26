package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/disintegration/imaging"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// CompressImage compresses an image to the specified directory
func (a *App) CompressImage(srcPath, dstPath string) error {
	src, err := imaging.Open(srcPath)
	if err != nil {
		return err
	}

	// Resize the image to fit within 1920px on the longest side
	src = imaging.Fit(src, 1920, 1920, imaging.Lanczos)

	// Create the destination directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	// Create the destination file
	file, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer file.Close()

	// Encode and save the image with 85% quality
	return jpeg.Encode(file, src, &jpeg.Options{Quality: 85})
}

// SaveAndCompressImage saves and compresses an uploaded image from base64 data
func (a *App) SaveAndCompressImage(base64Data string, originalFilename, dstPath string) error {
	// Decode the base64 data
	imageData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err
	}

	// Create a temporary file for the uploaded image
	tempFile, err := os.CreateTemp("", "upload-*"+filepath.Ext(originalFilename))
	if err != nil {
		return err
	}
	defer os.Remove(tempFile.Name()) // Clean up temp file
	defer tempFile.Close()

	// Write the image data to the temporary file
	if _, err := tempFile.Write(imageData); err != nil {
		return err
	}

	// Now compress the image from temp file to destination
	return a.CompressImage(tempFile.Name(), dstPath)
}

// SavePost saves a post as a markdown file
func (a *App) SavePost(title, content, description, author, coverImagePath, directory string, tags []string, weight int) error {
	// Get current date for directory
	currentDate := time.Now().Format("2006-01-02")

	// Create a safe filename based on title only
	safeTitle := strings.ToLower(title)                 // 全部转换为小写
	safeTitle = strings.ReplaceAll(safeTitle, " ", "-") // 空格替换为连字符
	safeTitle = strings.Map(func(r rune) rune {
		// 只保留字母、数字、连字符和下划线
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			return r
		}
		return -1
	}, safeTitle)

	// 限制标题长度以避免过长的文件名
	if len(safeTitle) > 50 {
		safeTitle = safeTitle[:50]
	}

	// 移除开头和结尾的连字符
	safeTitle = strings.Trim(safeTitle, "-_")

	// 如果标题变为空，使用默认名称
	if safeTitle == "" {
		safeTitle = "post"
	}

	// 创建基于日期的目录路径
	dateDirectory := filepath.Join(directory, currentDate)

	// 创建文件名（不带日期前缀）
	filename := fmt.Sprintf("%s.md", safeTitle)
	fullPath := filepath.Join(dateDirectory, filename)

	// 设置默认值
	if author == "" {
		author = "Aries"
	}
	if weight <= 0 {
		weight = 1
	}

	// 转义特殊字符
	escapedTitle := escapeString(title)
	escapedDescription := escapeString(description)
	escapedAuthor := escapeString(author)

	// Format tags as YAML array
	tagsFormatted := ""
	if len(tags) > 0 {
		tagsFormatted = "tags: ["
		for i, tag := range tags {
			if i > 0 {
				tagsFormatted += ", "
			}
			escapedTag := escapeString(tag)
			tagsFormatted += fmt.Sprintf("\"%s\"", escapedTag)
		}
		tagsFormatted += "]\n"
	}

	// Format author as YAML array
	authorFormatted := ""
	if escapedAuthor != "" {
		authorFormatted = fmt.Sprintf("author: [\"%s\"]\n", escapedAuthor)
	}

	// Format cover image if provided
	coverFormatted := ""
	if coverImagePath != "" {
		escapedCoverImagePath := escapeString(coverImagePath)
		coverFormatted = fmt.Sprintf("cover:\n    image: %s\n    hiddenInList: true\n", escapedCoverImagePath)
	}

	// Create disqus parameters
	disqusIdentifier := safeTitle
	disqusURL := fmt.Sprintf("https://xiaomizhou.net/%s/%s/", currentDate, safeTitle) // 需要替换为实际域名

	// Create the markdown content with enhanced front matter
	frontMatter := fmt.Sprintf("---\ntitle: \"%s\"\ndisqus_identifier: \"%s\"\ndisqus_url: \"%s\"\ndate: %s\ndescription: \"%s\"\n%s%s%sweight: %d\n---\n\n%s",
		escapedTitle, disqusIdentifier, disqusURL, currentDate, escapedDescription, tagsFormatted, authorFormatted, coverFormatted, weight, content)

	// Create the date directory if it doesn't exist
	if err := os.MkdirAll(dateDirectory, 0755); err != nil {
		return err
	}

	// Write the markdown file
	return os.WriteFile(fullPath, []byte(frontMatter), 0644)
}

// escapeString escapes special characters in a string for YAML
func escapeString(s string) string {
	// Escape backslashes first
	s = strings.ReplaceAll(s, "\\", "\\\\")
	// Escape double quotes
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

// CheckTitleDuplicate checks if a post with the same title already exists in the directory
func (a *App) CheckTitleDuplicate(title, directory string) (bool, string, error) {
	// Create a safe filename based on title only
	safeTitle := strings.ToLower(title)                 // 全部转换为小写
	safeTitle = strings.ReplaceAll(safeTitle, " ", "-") // 空格替换为连字符
	safeTitle = strings.Map(func(r rune) rune {
		// 只保留字母、数字、连字符和下划线
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			return r
		}
		return -1
	}, safeTitle)

	// 限制标题长度以避免过长的文件名
	if len(safeTitle) > 50 {
		safeTitle = safeTitle[:50]
	}

	// 移除开头和结尾的连字符
	safeTitle = strings.Trim(safeTitle, "-_")

	// 如果标题变为空，使用默认名称
	if safeTitle == "" {
		safeTitle = "post"
	}

	// 创建文件名（不带日期前缀）
	filename := fmt.Sprintf("%s.md", safeTitle)

	// Check all date directories for the file
	entries, err := os.ReadDir(directory)
	if err != nil {
		return false, "", err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the entry is a date directory (YYYY-MM-DD format)
			if isValidDateDir(entry.Name()) {
				// Check if the file exists in this date directory
				fullPath := filepath.Join(directory, entry.Name(), filename)
				if _, err := os.Stat(fullPath); err == nil {
					// File exists
					return true, fullPath, nil
				}
			}
		}
	}

	return false, "", nil
}

// isValidDateDir checks if a directory name is in YYYY-MM-DD format
func isValidDateDir(dirName string) bool {
	// Check if the directory name matches the date format
	_, err := time.Parse("2006-01-02", dirName)
	return err == nil
}

// SelectDirectory opens a dialog to select a directory
func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择保存目录",
	})
}

// SelectImageDirectory opens a dialog to select a directory for images
func (a *App) SelectImageDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择图片保存目录",
	})
}
