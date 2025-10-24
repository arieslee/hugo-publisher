package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"image/jpeg"
	"os"
	"os/exec"
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
func (a *App) SavePost(title, content, coverImagePath, directory string) error {
	// Get current date for the post
	currentDate := time.Now().Format("2006-01-02")

	// Create a safe filename based on title and date
	// Replace spaces and special characters
	safeTitle := strings.ReplaceAll(title, " ", "-")
	safeTitle = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			return r
		}
		return -1
	}, safeTitle)

	// Limit title length to avoid overly long filenames
	if len(safeTitle) > 50 {
		safeTitle = safeTitle[:50]
	}

	// Remove trailing hyphens
	safeTitle = strings.Trim(safeTitle, "-")

	// If title becomes empty, use a default name
	if safeTitle == "" {
		safeTitle = "post"
	}

	// Create filename based on title and date
	filename := fmt.Sprintf("%s-%s.md", currentDate, safeTitle)
	filepath := filepath.Join(directory, filename)

	// Create the markdown content with front matter
	markdownContent := fmt.Sprintf("---\ntitle: \"%s\"\ndate: \"%s\"\n---\n\n%s", title, currentDate, content)

	// Create the directory if it doesn't exist
	if err := os.MkdirAll(directory, 0755); err != nil {
		return err
	}

	// Write the markdown file
	return os.WriteFile(filepath, []byte(markdownContent), 0644)
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

// SelectGitRepoDirectory opens a dialog to select a directory containing a .git folder
func (a *App) SelectGitRepoDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 Git 仓库目录（包含 .git 文件夹的目录）",
	})
}

// IsValidGitRepo checks if the given directory is a valid git repository
func (a *App) IsValidGitRepo(directory string) (bool, error) {
	gitDir := filepath.Join(directory, ".git")
	_, err := os.Stat(gitDir)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// CommitToGit commits the saved post to git
func (a *App) CommitToGit(directory, filename string) error {
	// Check if the directory is a git repository
	gitDir := filepath.Join(directory, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		return fmt.Errorf("directory is not a git repository: %s", directory)
	}

	// Change to the directory
	cmd := exec.Command("git", "add", filename)
	cmd.Dir = directory
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git add failed: %w", err)
	}

	// Commit the file
	cmd = exec.Command("git", "commit", "-m", fmt.Sprintf("Add post: %s", filename))
	cmd.Dir = directory
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git commit failed: %w", err)
	}

	return nil
}
