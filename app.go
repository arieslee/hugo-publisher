package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
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

// IndexNowRequest represents the request structure for IndexNow API
type IndexNowRequest struct {
	Host        string   `json:"host"`
	Key         string   `json:"key"`
	KeyLocation string   `json:"keyLocation"`
	URLList     []string `json:"urlList"`
}

type PostInfo struct {
	Title            string   `json:"title"`
	CoverImage       string   `json:"coverImage"`
	CoverImageBase64 string   `json:"coverImageBase64"`
	Slug             string   `json:"slug"`         // 添加slug字段
	Keywords         []string `json:"keywords"`     // 添加关键词字段
	HiddenInList     bool     `json:"hiddenInList"` // 添加封面显示选项字段
	Date             string   `json:"date"`         // 发布日期
	LastMod          string   `json:"lastmod"`      // 最后修改日期
}

type ListPostsResult struct {
	Posts      []PostInfo `json:"posts"`
	TotalCount int        `json:"totalCount"`
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

// submitToIndexNow submits a URL to IndexNow API
func (a *App) submitToIndexNow(postURL string) error {
	// IndexNow configuration - these should be configured based on your site
	host := "xiaomizhou.net"
	key := "f886b7c5b67048d0a0086ea09a39f7b4" // This should be stored securely
	keyLocation := fmt.Sprintf("https://%s/%s.txt", host, key)

	// Create the request payload
	requestData := IndexNowRequest{
		Host:        host,
		Key:         key,
		KeyLocation: keyLocation,
		URLList:     []string{postURL},
	}

	// Convert to JSON
	jsonData, err := json.Marshal(requestData)
	if err != nil {
		return fmt.Errorf("failed to marshal IndexNow request: %v", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", "https://api.indexnow.org/IndexNow", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create IndexNow request: %v", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", "api.indexnow.org")

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send IndexNow request: %v", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read IndexNow response: %v", err)
	}

	// Check status code
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		fmt.Printf("Successfully submitted to IndexNow. Response: %s\n", string(body))
		return nil
	}

	return fmt.Errorf("IndexNow submission failed with status %d: %s", resp.StatusCode, string(body))
}

// parsePostInfo is a simplified parser for post front matter
func parsePostInfo(filePath, rootDirectory string) PostInfo {
	// Default title from filename
	base := filepath.Base(filePath)
	title := strings.TrimSuffix(base, ".md")
	info := PostInfo{Title: title, CoverImage: "", Slug: "", Keywords: []string{}, HiddenInList: true, Date: "", LastMod: ""}

	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return info // Return info with fallback title
	}

	contentStr := string(fileContent)

	if !strings.HasPrefix(contentStr, "---") {
		return info
	}

	parts := strings.SplitN(contentStr, "---", 3)
	if len(parts) < 3 {
		return info
	}

	frontMatter := parts[1]
	lines := strings.Split(frontMatter, "\n")
	inCoverBlock := false
	inKeywordsBlock := false

	for _, line := range lines {
		trimmedLine := strings.TrimSpace(line)

		if strings.HasPrefix(trimmedLine, "title:") {
			titleParts := strings.SplitN(line, ":", 2)
			if len(titleParts) == 2 {
				// Trim quotes and spaces
				info.Title = strings.Trim(strings.TrimSpace(titleParts[1]), "\"")
			}
			continue
		}

		if strings.HasPrefix(trimmedLine, "date:") {
			// Parse date
			dateParts := strings.SplitN(line, ":", 2)
			if len(dateParts) == 2 {
				info.Date = strings.TrimSpace(dateParts[1])
			}
			continue
		}

		if strings.HasPrefix(trimmedLine, "lastmod:") {
			// Parse lastmod
			lastmodParts := strings.SplitN(line, ":", 2)
			if len(lastmodParts) == 2 {
				info.LastMod = strings.TrimSpace(lastmodParts[1])
			}
			continue
		}

		if strings.HasPrefix(trimmedLine, "slug:") {
			slugParts := strings.SplitN(line, ":", 2)
			if len(slugParts) == 2 {
				// Trim quotes and spaces
				info.Slug = strings.Trim(strings.TrimSpace(slugParts[1]), "\"")
			}
			continue
		}

		if strings.HasPrefix(trimmedLine, "keywords:") {
			inKeywordsBlock = true
			continue
		}

		if inKeywordsBlock {
			if strings.HasPrefix(trimmedLine, "-") {
				// Extract keyword value
				keyword := strings.TrimSpace(strings.TrimPrefix(trimmedLine, "-"))
				keyword = strings.Trim(keyword, "\"")
				info.Keywords = append(info.Keywords, keyword)
			} else if trimmedLine != "" && !strings.HasPrefix(trimmedLine, " ") {
				// End of keywords block
				inKeywordsBlock = false
			}
		}

		if strings.HasPrefix(trimmedLine, "cover:") {
			inCoverBlock = true
			continue
		}

		if inCoverBlock && strings.HasPrefix(trimmedLine, "image:") {
			imageParts := strings.SplitN(line, ":", 2)
			if len(imageParts) == 2 {
				info.CoverImage = strings.TrimSpace(imageParts[1])
			}
			continue
		}

		if inCoverBlock && strings.HasPrefix(trimmedLine, "hiddenInList:") {
			hiddenParts := strings.SplitN(line, ":", 2)
			if len(hiddenParts) == 2 {
				// Parse boolean value
				hiddenValue := strings.TrimSpace(hiddenParts[1])
				info.HiddenInList = strings.ToLower(hiddenValue) == "true"
			}
			continue
		}

		if inCoverBlock && !strings.HasPrefix(line, " ") {
			inCoverBlock = false
		}
	}

	// If title from frontmatter is empty, use the fallback
	if info.Title == "" {
		info.Title = title
	}

	if info.CoverImage != "" && rootDirectory != "" {
		// fmt.Printf("Attempting to load cover image. Path from front matter: %s\n", info.CoverImage)
		// The path in front matter might start with a '/', remove it
		cleanCoverPath := strings.TrimPrefix(info.CoverImage, "/")
		absPath := filepath.Join(rootDirectory, "static", cleanCoverPath)
		// fmt.Printf("Constructed absolute image path: %s\n", absPath)

		// Read image file
		data, err := os.ReadFile(absPath)
		if err == nil {
			// fmt.Printf("Successfully read image file.\n")
			// Encode to Base64
			info.CoverImageBase64 = base64.StdEncoding.EncodeToString(data)
		} else {
			// fmt.Printf("Failed to read image file: %v\n", err)
		}
	} else if info.CoverImage != "" {
		// fmt.Printf("Cover image found (%s), but root directory is not set. Skipping image loading.\n", info.CoverImage)
	}

	return info
}

// ListPosts lists all posts in the directory with pagination and search support
func (a *App) ListPosts(directory, rootDirectory string, page, pageSize int, search string) (ListPostsResult, error) {
	// fmt.Printf("ListPosts called with directory: %s, rootDirectory: %s, page: %d, pageSize: %d, search: '%s'\n", directory, rootDirectory, page, pageSize, search)

	var allPosts []PostInfo

	if _, err := os.Stat(directory); os.IsNotExist(err) {
		// fmt.Printf("目录不存在: %s\n", directory)
		return ListPostsResult{Posts: allPosts, TotalCount: 0}, nil
	}

	entries, err := os.ReadDir(directory)
	if err != nil {
		// fmt.Printf("读取目录失败: %v\n", err)
		return ListPostsResult{}, err
	}

	// fmt.Printf("目录中有 %d 个条目\n", len(entries))

	// Prepare search term - convert to lowercase for case-insensitive search
	searchTerm := strings.ToLower(strings.TrimSpace(search))
	// fmt.Printf("处理搜索词: '%s'\n", searchTerm)

	for _, entry := range entries {
		if entry.IsDir() {
			if isValidDatePath(entry.Name()) {
				// fmt.Printf("发现日期目录: %s\n", entry.Name())
				dateDirPath := filepath.Join(directory, entry.Name())
				files, err := os.ReadDir(dateDirPath)
				if err != nil {
					// fmt.Printf("读取日期目录失败 %s: %v\n", dateDirPath, err)
					continue
				}

				for _, file := range files {
					if !file.IsDir() && filepath.Ext(file.Name()) == ".md" {
						mdFilePath := filepath.Join(dateDirPath, file.Name())
						// fmt.Printf("处理文章文件: %s\n", mdFilePath)
						info := parsePostInfo(mdFilePath, rootDirectory)
						// fmt.Printf("解析文章信息: %+v\n", info)

						if info.Title == "_index" {
							continue
						}
						if searchTerm != "" {
							// Search in title, slug, and keywords
							lowerTitle := strings.ToLower(info.Title)
							lowerSlug := strings.ToLower(info.Slug)

							// fmt.Printf("检查文章: 标题='%s', 转换后='%s', 搜索词='%s'\n", info.Title, lowerTitle, searchTerm)

							// Check if search term matches title, slug, or any keyword
							matches := false

							// 检查标题匹配（支持部分匹配）
							if strings.Contains(lowerTitle, searchTerm) {
								matches = true
								// fmt.Printf("标题匹配成功: '%s' 包含 '%s'\n", lowerTitle, searchTerm)
							}

							// 检查slug匹配（支持部分匹配）
							if !matches && strings.Contains(lowerSlug, searchTerm) {
								matches = true
								// fmt.Printf("Slug匹配成功: '%s' 包含 '%s'\n", lowerSlug, searchTerm)
							}

							// 检查关键词匹配（支持部分匹配）
							if !matches {
								for _, keyword := range info.Keywords {
									lowerKeyword := strings.ToLower(keyword)
									if strings.Contains(lowerKeyword, searchTerm) {
										matches = true
										// fmt.Printf("关键词匹配成功: '%s' 包含 '%s'\n", lowerKeyword, searchTerm)
										break
									}
								}
							}

							// 如果还是没有匹配，尝试分词匹配
							if !matches && len(searchTerm) > 1 {
								// 将搜索词按空格分割，进行分词搜索
								searchTerms := strings.Fields(searchTerm)
								if len(searchTerms) > 1 {
									allMatch := true
									for _, term := range searchTerms {
										if !strings.Contains(lowerTitle, term) &&
											!strings.Contains(lowerSlug, term) {
											// 检查关键词
											keywordMatch := false
											for _, keyword := range info.Keywords {
												if strings.Contains(strings.ToLower(keyword), term) {
													keywordMatch = true
													break
												}
											}
											if !keywordMatch {
												allMatch = false
												break
											}
										}
									}
									if allMatch {
										matches = true
										// fmt.Printf("分词匹配成功\n")
									}
								}
							}

							if matches {
								// fmt.Printf("文章 '%s' 匹配搜索条件，添加到列表\n", info.Title)
								allPosts = append(allPosts, info)
							} else {
								// fmt.Printf("文章 '%s' 不匹配搜索条件\n", info.Title)
							}
						} else {
							allPosts = append(allPosts, info)
							// fmt.Printf("  -> 添加到列表（无搜索条件）\n")
						}
					}
				}
			}
		} else if !entry.IsDir() && filepath.Ext(entry.Name()) == ".md" {
			mdFilePath := filepath.Join(directory, entry.Name())
			// fmt.Printf("处理直接文件: %s\n", mdFilePath)
			info := parsePostInfo(mdFilePath, rootDirectory)
			// fmt.Printf("解析直接文件信息: %+v\n", info)

			if info.Title == "_index" {
				continue
			}
			if searchTerm != "" {
				// Search in title, slug, and keywords
				lowerTitle := strings.ToLower(info.Title)
				lowerSlug := strings.ToLower(info.Slug)

				// fmt.Printf("检查文章: 标题='%s', 转换后='%s', 搜索词='%s'\n", info.Title, lowerTitle, searchTerm)

				// Check if search term matches title, slug, or any keyword
				matches := false

				// 检查标题匹配（支持部分匹配）
				if strings.Contains(lowerTitle, searchTerm) {
					matches = true
					// fmt.Printf("标题匹配成功: '%s' 包含 '%s'\n", lowerTitle, searchTerm)
				}

				// 检查slug匹配（支持部分匹配）
				if !matches && strings.Contains(lowerSlug, searchTerm) {
					matches = true
					// fmt.Printf("Slug匹配成功: '%s' 包含 '%s'\n", lowerSlug, searchTerm)
				}

				// 检查关键词匹配（支持部分匹配）
				if !matches {
					for _, keyword := range info.Keywords {
						lowerKeyword := strings.ToLower(keyword)
						if strings.Contains(lowerKeyword, searchTerm) {
							matches = true
							// fmt.Printf("关键词匹配成功: '%s' 包含 '%s'\n", lowerKeyword, searchTerm)
							break
						}
					}
				}

				// 如果还是没有匹配，尝试分词匹配
				if !matches && len(searchTerm) > 1 {
					// 将搜索词按空格分割，进行分词搜索
					searchTerms := strings.Fields(searchTerm)
					if len(searchTerms) > 1 {
						allMatch := true
						for _, term := range searchTerms {
							if !strings.Contains(lowerTitle, term) &&
								!strings.Contains(lowerSlug, term) {
								// 检查关键词
								keywordMatch := false
								for _, keyword := range info.Keywords {
									if strings.Contains(strings.ToLower(keyword), term) {
										keywordMatch = true
										break
									}
								}
								if !keywordMatch {
									allMatch = false
									break
								}
							}
						}
						if allMatch {
							matches = true
							// fmt.Printf("分词匹配成功\n")
						}
					}
				}

				if matches {
					// fmt.Printf("文章 '%s' 匹配搜索条件，添加到列表\n", info.Title)
					allPosts = append(allPosts, info)
				} else {
					// fmt.Printf("文章 '%s' 不匹配搜索条件\n", info.Title)
				}
			} else {
				allPosts = append(allPosts, info)
				// fmt.Printf("  -> 添加到列表（无搜索条件）\n")
			}
		}
	}

	// Sort posts by lastmod (descending) then by date (descending)
	// If lastmod is not available, use date as fallback
	sort.Slice(allPosts, func(i, j int) bool {
		// First try to compare by lastmod
		if allPosts[i].LastMod != "" && allPosts[j].LastMod != "" {
			// Parse time strings
			timeI, errI := time.Parse("2006-01-02T15:04:05-07:00", allPosts[i].LastMod)
			timeJ, errJ := time.Parse("2006-01-02T15:04:05-07:00", allPosts[j].LastMod)

			if errI == nil && errJ == nil {
				return timeI.After(timeJ) // Descending order
			}
		}

		// If lastmod is not available or parsing failed, compare by date
		if allPosts[i].Date != "" && allPosts[j].Date != "" {
			// Parse date strings
			timeI, errI := time.Parse("2006-01-02", allPosts[i].Date)
			timeJ, errJ := time.Parse("2006-01-02", allPosts[j].Date)

			if errI == nil && errJ == nil {
				return timeI.After(timeJ) // Descending order
			}
		}

		// If both time fields are missing or invalid, maintain original order
		return false
	})

	totalCount := len(allPosts)
	// fmt.Printf("总共找到 %d 篇文章\n", totalCount)

	if totalCount == 0 {
		return ListPostsResult{Posts: allPosts, TotalCount: 0}, nil
	}

	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 5 // 使用与前端一致的页面大小
	}

	startIndex := (page - 1) * pageSize
	endIndex := startIndex + pageSize

	if endIndex > totalCount {
		endIndex = totalCount
	}

	if startIndex >= totalCount {
		// fmt.Printf("起始索引超出范围，返回空列表\n")
		return ListPostsResult{Posts: []PostInfo{}, TotalCount: totalCount}, nil
	}

	pagedPosts := allPosts[startIndex:endIndex]
	// fmt.Printf("返回第 %d 页的数据，共 %d 篇文章\n", page, len(pagedPosts))

	return ListPostsResult{Posts: pagedPosts, TotalCount: totalCount}, nil
}

// ListPostsSimple lists all posts in the directory, returning only the post titles
func (a *App) ListPostsSimple(directory string) []string {
	posts := make([]string, 0)

	// Check if directory exists
	if _, err := os.Stat(directory); os.IsNotExist(err) {
		// fmt.Printf("目录不存在: %s\n", directory)
		return posts // Return empty list if directory doesn't exist
	}

	// fmt.Printf("正在读取目录: %s\n", directory)

	// Read directory entries
	entries, err := os.ReadDir(directory)
	if err != nil {
		// fmt.Printf("读取目录失败: %v\n", err)
		return posts
	}

	// fmt.Printf("目录中有 %d 个条目\n", len(entries))

	// Look for date directories and direct markdown files
	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the entry is a date directory (YYYY-MM-DD format)
			if isValidDatePath(entry.Name()) {
				// fmt.Printf("发现日期目录: %s\n", entry.Name())
				// Read files in the date directory
				dateDirPath := filepath.Join(directory, entry.Name())
				files, err := os.ReadDir(dateDirPath)
				if err != nil {
					// fmt.Printf("读取日期目录失败 %s: %v\n", dateDirPath, err)
					continue // Skip this directory if we can't read it
				}

				// Add markdown files to the list
				for _, file := range files {
					if !file.IsDir() && filepath.Ext(file.Name()) == ".md" {
						// Extract title from filename (remove .md extension)
						title := strings.TrimSuffix(file.Name(), ".md")
						// fmt.Printf("  发现文章: %s (标题: %s)\n", file.Name(), title)
						posts = append(posts, title)
						// fmt.Printf("    -> 添加到列表\n")
					}
				}
			}
		} else if !entry.IsDir() && filepath.Ext(entry.Name()) == ".md" {
			// Also check for markdown files directly in the directory (not in date folders)
			// Extract title from filename (remove .md extension)
			title := strings.TrimSuffix(entry.Name(), ".md")
			// fmt.Printf("发现直接文件: %s (标题: %s)\n", entry.Name(), title)
			posts = append(posts, title)
			// fmt.Printf("  -> 添加到列表\n")
		}
	}

	// fmt.Printf("总共找到 %d 篇文章\n", len(posts))
	return posts
}

// LoadPost loads a post's content
func (a *App) LoadPost(title, directory string) (string, error) {
	// First try the traditional method (for backward compatibility)
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

	// Check all date directories for the file using safe title
	entries, err := os.ReadDir(directory)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the entry is a date directory (YYYY-MM-DD format)
			if isValidDatePath(entry.Name()) {
				// Check if the file exists in this date directory
				fullPath := filepath.Join(directory, entry.Name(), filename)
				if _, err := os.Stat(fullPath); err == nil {
					// File exists, read its content
					content, err := os.ReadFile(fullPath)
					if err != nil {
						return "", err
					}
					return string(content), nil
				}
			}
		}
	}

	// If not found with safe title, try to find by matching the actual title in front matter
	// This handles cases where the title contains special characters
	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the entry is a date directory (YYYY-MM-DD format)
			if isValidDatePath(entry.Name()) {
				// Read files in the date directory
				dateDirPath := filepath.Join(directory, entry.Name())
				files, err := os.ReadDir(dateDirPath)
				if err != nil {
					continue // Skip this directory if we can't read it
				}

				// Check each file in the date directory
				for _, file := range files {
					if !file.IsDir() && filepath.Ext(file.Name()) == ".md" {
						// Read the file content
						fullPath := filepath.Join(dateDirPath, file.Name())
						content, err := os.ReadFile(fullPath)
						if err != nil {
							continue
						}

						// Parse the front matter to get the actual title
						contentStr := string(content)
						if strings.HasPrefix(contentStr, "---") {
							parts := strings.SplitN(contentStr, "---", 3)
							if len(parts) >= 3 {
								frontMatter := parts[1]
								lines := strings.Split(frontMatter, "\n")

								// Look for the title in front matter
								for _, line := range lines {
									trimmedLine := strings.TrimSpace(line)
									if strings.HasPrefix(trimmedLine, "title:") {
										titleParts := strings.SplitN(line, ":", 2)
										if len(titleParts) == 2 {
											// Trim quotes and spaces
											actualTitle := strings.Trim(strings.TrimSpace(titleParts[1]), "\"")
											// If the title matches, return the content
											if actualTitle == title {
												return contentStr, nil
											}
										}
										break
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return "", fmt.Errorf("文章未找到: %s", title)
}

// DeletePost deletes a post and its associated images
func (a *App) DeletePost(title, directory, imageDirectory, rootDirectory string) error {
	// First try the traditional method (for backward compatibility)
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

	// Check all date directories for the file using safe title
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}

	fileFound := false
	var postFilePath string
	var postDate string

	// First try to find the file using safe title
	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the entry is a date directory (YYYY-MM-DD format)
			if isValidDatePath(entry.Name()) {
				// Check if the file exists in this date directory
				fullPath := filepath.Join(directory, entry.Name(), filename)
				if _, err := os.Stat(fullPath); err == nil {
					// File exists
					fileFound = true
					postFilePath = fullPath
					postDate = entry.Name()
					break
				}
			}
		}
	}

	// If not found with safe title, try to find by matching the actual title in front matter
	// This handles cases where the title contains special characters
	if !fileFound {
		for _, entry := range entries {
			if entry.IsDir() {
				// Check if the entry is a date directory (YYYY-MM-DD format)
				if isValidDatePath(entry.Name()) {
					// Read files in the date directory
					dateDirPath := filepath.Join(directory, entry.Name())
					files, err := os.ReadDir(dateDirPath)
					if err != nil {
						continue // Skip this directory if we can't read it
					}

					// Check each file in the date directory
					for _, file := range files {
						if !file.IsDir() && filepath.Ext(file.Name()) == ".md" {
							// Read the file content
							fullPath := filepath.Join(dateDirPath, file.Name())
							content, err := os.ReadFile(fullPath)
							if err != nil {
								continue
							}

							// Parse the front matter to get the actual title
							contentStr := string(content)
							if strings.HasPrefix(contentStr, "---") {
								parts := strings.SplitN(contentStr, "---", 3)
								if len(parts) >= 3 {
									frontMatter := parts[1]
									lines := strings.Split(frontMatter, "\n")

									// Look for the title in front matter
									for _, line := range lines {
										trimmedLine := strings.TrimSpace(line)
										if strings.HasPrefix(trimmedLine, "title:") {
											titleParts := strings.SplitN(line, ":", 2)
											if len(titleParts) == 2 {
												// Trim quotes and spaces
												actualTitle := strings.Trim(strings.TrimSpace(titleParts[1]), "\"")
												// If the title matches, we found the file to delete
												if actualTitle == title {
													fileFound = true
													postFilePath = fullPath
													postDate = entry.Name()
													break
												}
											}
											break
										}
									}
								}
							}

							// If we found the file, no need to check other files
							if fileFound {
								break
							}
						}
					}

					// If we found the file, no need to check other directories
					if fileFound {
						break
					}
				}
			}
		}
	}

	if !fileFound {
		return fmt.Errorf("文章未找到: %s", title)
	}

	// Read the post content to extract image paths
	content, err := os.ReadFile(postFilePath)
	if err != nil {
		return err
	}

	// Extract image paths from the content
	imagePaths := extractImagePaths(string(content), imageDirectory, rootDirectory)

	// Delete associated images
	for _, imagePath := range imagePaths {
		if imagePath != "" {
			// Convert relative path to absolute path
			var absoluteImagePath string
			if filepath.IsAbs(imagePath) {
				absoluteImagePath = imagePath
			} else {
				// Handle relative paths
				if rootDirectory != "" {
					absoluteImagePath = filepath.Join(rootDirectory, imagePath)
				} else {
					absoluteImagePath = filepath.Join(imageDirectory, imagePath)
				}
			}

			// Delete the image file if it exists
			if _, err := os.Stat(absoluteImagePath); err == nil {
				if err := os.Remove(absoluteImagePath); err != nil {
					fmt.Printf("Warning: Failed to delete image %s: %v\n", absoluteImagePath, err)
				}
			}
		}
	}

	// Delete the post file
	if err := os.Remove(postFilePath); err != nil {
		return err
	}

	// Check if the date directory is empty and delete it if so
	dateDir := filepath.Join(directory, postDate)
	isEmpty, err := isDirEmpty(dateDir)
	if err != nil {
		return err
	}

	if isEmpty {
		// Delete the empty date directory
		if err := os.Remove(dateDir); err != nil {
			fmt.Printf("Warning: Failed to delete empty directory %s: %v\n", dateDir, err)
		}
	}

	return nil
}

// UpdatePost updates an existing post
func (a *App) UpdatePost(oldTitle, newTitle, content, description, author, coverImagePath, directory string, tags []string, weight int, slug string, keywords string, isHiddenInList bool) error {
	// First delete the old post (but preserve images by not passing imageDirectory/rootDirectory)
	if err := a.DeletePost(oldTitle, directory, "", ""); err != nil {
		return err
	}

	// Then save the new post
	return a.SavePost(newTitle, content, description, author, coverImagePath, directory, tags, weight, slug, keywords, isHiddenInList)
}

// extractImagePaths extracts image paths from markdown content
func extractImagePaths(content, imageDirectory, rootDirectory string) []string {
	var imagePaths []string

	// Simple regex to find image paths in markdown
	// This is a basic implementation and might need to be enhanced based on actual usage
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		// Look for markdown image syntax: ![alt](path)
		if strings.Contains(line, "![](") || strings.Contains(line, "![") {
			// Extract path between parentheses
			start := strings.Index(line, "(")
			end := strings.Index(line, ")")
			if start != -1 && end != -1 && end > start {
				path := line[start+1 : end]
				// Clean up the path
				path = strings.TrimSpace(path)
				// Remove quotes if present
				path = strings.Trim(path, "\"'")
				if path != "" {
					// Check if it's a relative path starting with /images/uploads/
					if strings.HasPrefix(path, "/images/uploads/") {
						// Convert to absolute path for deletion
						if imageDirectory != "" {
							// Extract filename from path
							filename := filepath.Base(path)
							// Construct absolute path
							absolutePath := filepath.Join(imageDirectory, filename)
							imagePaths = append(imagePaths, absolutePath)
						}
					} else {
						imagePaths = append(imagePaths, path)
					}
				}
			}
		}
	}

	return imagePaths
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

// isDirEmpty checks if a directory is empty
func isDirEmpty(dirPath string) (bool, error) {
	f, err := os.Open(dirPath)
	if err != nil {
		return false, err
	}
	defer f.Close()

	// Read directory entries
	_, err = f.Readdirnames(1)
	if err == nil {
		// Directory is not empty
		return false, nil
	}

	if err == io.EOF {
		// Directory is empty
		return true, nil
	}

	// Other error
	return false, err
}

// isValidDatePath checks if a directory name is in YYYY-MM-DD format
func isValidDatePath(dirName string) bool {
	// Check if the directory name matches the date format
	_, err := time.Parse("2006-01-02", dirName)
	return err == nil
}

// SavePost saves a post as a markdown file
func (a *App) SavePost(title, content, description, author, coverImagePath, directory string, tags []string, weight int, slug string, keywords string, isHiddenInList bool) error {
	// Get current date for directory
	currentDate := time.Now().Format("2006-01-02")

	// Create a safe filename based on title or slug
	safeTitle := createSafeFilename(title)
	if slug != "" {
		// 如果提供了自定义slug，则使用它作为文件名
		safeTitle = createSafeFilename(slug)
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

	// Format title - always use quoted format for consistency
	titleFormatted := fmt.Sprintf("title: \"%s\"\n", escapeString(title))

	// Format description - always use quoted format for consistency
	descriptionFormatted := fmt.Sprintf("description: \"%s\"\n", escapeString(description))

	// Format author as YAML array
	authorFormatted := fmt.Sprintf("author: [\"%s\"]\n", escapeString(author))

	// Format tags as YAML array
	tagsFormatted := ""
	if len(tags) > 0 {
		tagsFormatted = "tags: ["
		for i, tag := range tags {
			if i > 0 {
				tagsFormatted += ", "
			}
			tagsFormatted += fmt.Sprintf("\"%s\"", escapeString(tag))
		}
		tagsFormatted += "]\n"
	}

	// Format cover image if provided
	coverFormatted := ""
	if coverImagePath != "" {
		// 根据用户选择设置 hiddenInList 值
		coverFormatted = fmt.Sprintf("cover:\n    image: %s\n    hiddenInList: %t\n", coverImagePath, isHiddenInList)
	}

	// Create disqus parameters
	disqusURL := fmt.Sprintf("https://xiaomizhou.net/%s/%s/", currentDate, safeTitle) // 需要替换为实际域名

	// 如果提供了自定义slug，则使用它生成URL
	if slug != "" {
		disqusURL = fmt.Sprintf("https://xiaomizhou.net/%s/%s/", currentDate, createSafeFilename(slug))
	}

	// Format keywords as YAML array (处理逗号分隔的关键词)
	keywordsFormatted := ""
	if keywords != "" {
		// Split keywords by comma and trim spaces
		keywordList := strings.Split(keywords, ",")
		keywordsFormatted = "keywords:\n"
		for _, keyword := range keywordList {
			trimmedKeyword := strings.TrimSpace(keyword)
			if trimmedKeyword != "" {
				keywordsFormatted += fmt.Sprintf("    - \"%s\"\n", escapeString(trimmedKeyword))
			}
		}
	}

	// Get current time for lastmod
	lastmod := time.Now().Format("2006-01-02T15:04:05-07:00")

	// Create the markdown content with enhanced front matter
	frontMatter := fmt.Sprintf("---\n%sdate: %s\nlastmod: %s\n%s%s%s%s%sweight: %d\n",
		titleFormatted, currentDate, lastmod, descriptionFormatted, tagsFormatted, authorFormatted, coverFormatted, keywordsFormatted, weight)

	// 如果提供了自定义slug，则添加到front matter中
	if slug != "" {
		frontMatter += fmt.Sprintf("slug: \"%s\"\n", slug)
	}

	frontMatter += fmt.Sprintf("---\n\n%s", content)

	// Create the date directory if it doesn't exist
	if err := os.MkdirAll(dateDirectory, 0755); err != nil {
		return err
	}

	// Write the markdown file
	if err := os.WriteFile(fullPath, []byte(frontMatter), 0644); err != nil {
		return err
	}

	// 确保文件写入完成后再返回
	time.Sleep(100 * time.Millisecond)

	// Submit to IndexNow after successful post creation
	go func() {
		// Add a small delay to ensure the file is accessible via web server
		time.Sleep(2 * time.Second)

		// Submit the post URL to IndexNow
		if err := a.submitToIndexNow(disqusURL); err != nil {
			fmt.Printf("Warning: Failed to submit to IndexNow: %v\n", err)
		}
	}()

	return nil
}

// createSafeFilename creates a safe filename from a title
func createSafeFilename(title string) string {
	// Convert to lowercase
	safeTitle := strings.ToLower(title)

	// Replace spaces with hyphens
	safeTitle = strings.ReplaceAll(safeTitle, " ", "-")

	// Process each character
	var result strings.Builder
	for _, r := range safeTitle {
		// Keep letters, digits, hyphens, and underscores
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			result.WriteRune(r)
		} else if r == ' ' {
			// Convert spaces to hyphens (should already be done, but just in case)
			result.WriteRune('-')
		} else {
			// For other characters (including Chinese), convert to Pinyin or keep as-is
			// For now, we'll keep them as-is and replace with hyphens
			result.WriteRune('-')
		}
	}

	safeTitle = result.String()

	// Replace multiple consecutive hyphens with a single hyphen
	safeTitle = strings.ReplaceAll(safeTitle, "--", "-")
	safeTitle = strings.ReplaceAll(safeTitle, "--", "-") // Do it twice to handle cases like "---"

	// Limit title length to avoid overly long filenames
	if len(safeTitle) > 50 {
		safeTitle = safeTitle[:50]
	}

	// Trim leading and trailing hyphens and underscores
	safeTitle = strings.Trim(safeTitle, "-_")

	// If title becomes empty, use a default
	if safeTitle == "" {
		safeTitle = "post"
	}

	return safeTitle
}

// escapeString escapes special characters in a string for YAML
func escapeString(s string) string {
	// Escape backslashes first
	s = strings.ReplaceAll(s, "\\", "\\\\")
	// Escape double quotes
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

// LoadImageAsBase64 loads an image file and returns its base64 encoded content
func (a *App) LoadImageAsBase64(imagePath, rootDirectory string) (string, error) {
	// If the image path is relative (starts with /), construct the absolute path
	if strings.HasPrefix(imagePath, "/") && rootDirectory != "" {
		// Remove leading slash and construct absolute path
		cleanImagePath := strings.TrimPrefix(imagePath, "/")
		absPath := filepath.Join(rootDirectory, "static", cleanImagePath)

		// Read image file
		data, err := os.ReadFile(absPath)
		if err != nil {
			return "", fmt.Errorf("failed to read image file: %v", err)
		}

		// Encode to Base64
		base64Data := base64.StdEncoding.EncodeToString(data)
		return base64Data, nil
	}

	// If it's already an absolute path or rootDirectory is not set
	if filepath.IsAbs(imagePath) {
		// Read image file
		data, err := os.ReadFile(imagePath)
		if err != nil {
			return "", fmt.Errorf("failed to read image file: %v", err)
		}

		// Encode to Base64
		base64Data := base64.StdEncoding.EncodeToString(data)
		return base64Data, nil
	}

	return "", fmt.Errorf("invalid image path or root directory not set")
}

// CheckTitleDuplicate checks if a post with the same title already exists in the directory
func (a *App) CheckTitleDuplicate(title, directory string) (bool, string, error) {
	// Create a safe filename based on title only
	safeTitle := createSafeFilename(title)

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
			if isValidDatePath(entry.Name()) {
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
